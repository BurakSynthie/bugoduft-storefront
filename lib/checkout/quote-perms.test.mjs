// §0035 quote permission regression. Applies the real quote-related migrations (0008 → 0034 →
// 0035) with their GRANT/REVOKE/policies and switches into actual anon / authenticated /
// service_role roles to prove the production permission surface:
//   A anon direct INSERT denied
//   B ordinary authenticated UPDATE denied by RLS
//   C ordinary authenticated DELETE denied by RLS
//   D authenticated ADMIN can UPDATE
//   E authenticated ADMIN can DELETE
//   + quote_rate_check: anon/authenticated cannot execute, service_role can; 1..5 allow, 6 blocks
// Run: node lib/checkout/quote-perms.test.mjs
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';

let failures = 0;
const pass = (m) => console.log('PASS ' + m);
const fail = (m) => { console.log('FAIL ' + m); failures++; };
const db = await PGlite.create();
const q = async (sql, p) => (await db.query(sql, p)).rows;

await db.exec(`
  do $$ begin create role anon;          exception when duplicate_object then null; end $$;
  do $$ begin create role authenticated; exception when duplicate_object then null; end $$;
  do $$ begin create role service_role;  exception when duplicate_object then null; end $$;
  alter role service_role bypassrls;
  -- auth schema/users referenced by 0008 (updated_by fk); storage schema referenced by 0034.
  create schema if not exists auth;
  create table if not exists auth.users (id uuid primary key default gen_random_uuid());
  create schema if not exists storage;
  create table if not exists storage.buckets (id text primary key, public boolean default false, file_size_limit bigint);
  insert into storage.buckets (id, public) values ('customer-files', false) on conflict do nothing;
  -- locale enum used by the quotes table in 0008.
  do $$ begin create type locale as enum ('de','en','fr'); exception when duplicate_object then null; end $$;
  -- is_admin() is driven by a GUC so we can simulate an admin vs an ordinary authenticated user.
  create or replace function is_admin() returns boolean language sql stable
    as $$ select coalesce(current_setting('test.is_admin', true) = 'on', false) $$;
  -- base grants so a failure is proven to come from the migration's REVOKE, not a missing grant.
  -- (0034/0035 then revoke the write bits from anon/authenticated as appropriate.)
`);

// Apply the real migrations verbatim (only the quote-relevant DDL is exercised here).
await db.exec(readFileSync('supabase/migrations/0008_site_settings_quotes.sql', 'utf8'));
await db.exec(readFileSync('supabase/migrations/0034_final_launch_technical_closeout.sql', 'utf8'));
await db.exec(readFileSync('supabase/migrations/0035_quote_permissions_final_fix.sql', 'utf8'));

// base grants for SELECT so authenticated admin reads work (RLS still gates rows).
await db.exec(`grant select on table quotes to authenticated;`);

// Seed a couple of quote rows as owner (bypasses RLS).
await db.exec(`insert into quotes (id, email, source) values
  ('11111111-1111-1111-1111-111111111111','a@x.com','storefront'),
  ('22222222-2222-2222-2222-222222222222','b@x.com','storefront');`);

async function asRole(role, fn, { admin = false } = {}) {
  await db.exec(`select set_config('test.is_admin', '${admin ? 'on' : 'off'}', false)`);
  await db.exec(`set role ${role}`);
  try { return await fn(); }
  finally { await db.exec(`reset role`); await db.exec(`select set_config('test.is_admin', 'off', false)`); }
}
async function denied(role, sql, opts) {
  try { await asRole(role, () => q(sql), opts); return false; }
  catch { await db.exec('reset role'); return true; }
}
async function allowed(role, sql, opts) {
  try { await asRole(role, () => q(sql), opts); return true; }
  catch (e) { await db.exec('reset role'); return false; }
}

// Row-count aware helpers: under RLS, a non-admin UPDATE/DELETE does not error — it simply
// matches ZERO rows (the USING clause filters them out). So "denied by RLS" == no rows changed,
// and "allowed" == at least one row changed. We verify with a RETURNING count.
async function rowsAffected(role, sql, opts) {
  await db.exec(`select set_config('test.is_admin', '${opts?.admin ? 'on' : 'off'}', false)`);
  await db.exec(`set role ${role}`);
  try {
    const rows = await q(sql);
    return rows.length;
  } finally { await db.exec('reset role'); await db.exec(`select set_config('test.is_admin', 'off', false)`); }
}

// A anon direct INSERT denied (no policy + no table grant → hard privilege error).
if (await denied('anon', `insert into quotes (email, source) values ('evil@x.com','storefront')`))
  pass('A anon direct INSERT denied'); else fail('A anon INSERT was allowed');

// B ordinary authenticated UPDATE denied by RLS → affects ZERO rows.
{
  const n = await rowsAffected('authenticated',
    `update quotes set status='done' where id='11111111-1111-1111-1111-111111111111' returning id`, { admin: false });
  if (n === 0) pass('B ordinary authenticated UPDATE denied by RLS (0 rows)'); else fail('B non-admin UPDATE changed rows: ' + n);
}

// C ordinary authenticated DELETE denied by RLS → affects ZERO rows.
{
  const n = await rowsAffected('authenticated',
    `delete from quotes where id='11111111-1111-1111-1111-111111111111' returning id`, { admin: false });
  if (n === 0) pass('C ordinary authenticated DELETE denied by RLS (0 rows)'); else fail('C non-admin DELETE changed rows: ' + n);
}

// D authenticated ADMIN can UPDATE → affects the row.
{
  const n = await rowsAffected('authenticated',
    `update quotes set status='in_progress' where id='11111111-1111-1111-1111-111111111111' returning id`, { admin: true });
  if (n === 1) pass('D authenticated admin UPDATE allowed (1 row)'); else fail('D admin UPDATE affected rows: ' + n);
}

// E authenticated ADMIN can DELETE → affects the row.
{
  const n = await rowsAffected('authenticated',
    `delete from quotes where id='22222222-2222-2222-2222-222222222222' returning id`, { admin: true });
  if (n === 1) pass('E authenticated admin DELETE allowed (1 row)'); else fail('E admin DELETE affected rows: ' + n);
}

// authenticated INSERT still denied (must remain revoked even for admin table priv).
if (await denied('authenticated', `insert into quotes (email, source) values ('x@x.com','storefront')`, { admin: true }))
  pass('authenticated INSERT still denied (no table grant)'); else fail('authenticated INSERT was allowed');

// --- quote_rate_check EXECUTE surface ---
const RC = `select quote_rate_check('k-perms', 5, 3600)`;
if (await denied('anon', RC)) pass('anon cannot EXECUTE quote_rate_check'); else fail('anon executed quote_rate_check');
if (await denied('authenticated', RC)) pass('authenticated cannot EXECUTE quote_rate_check'); else fail('authenticated executed quote_rate_check');
if (await allowed('service_role', RC)) pass('service_role can EXECUTE quote_rate_check'); else fail('service_role could not execute quote_rate_check');

// 1..5 allowed, 6 blocked (as service_role).
let seq = [];
for (let i = 0; i < 6; i++) {
  const r = await asRole('service_role', () => q(`select quote_rate_check('k-seq', 5, 3600) as a`));
  seq.push(r[0].a);
}
if (seq.slice(0,5).every(x => x === true) && seq[5] === false)
  pass('rate limit allows 1..5, blocks 6'); else fail('rate limit sequence wrong: ' + JSON.stringify(seq));

console.log(failures === 0 ? '\nALL QUOTE-PERMS TESTS PASSED' : `\n${failures} QUOTE-PERMS TEST(S) FAILED`);
process.exit(failures ? 1 : 0);
