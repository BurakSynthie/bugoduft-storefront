// §OPTION-3 REAL role/EXECUTE permission test for the checkout-intent RPCs. Keeps GRANT/REVOKE
// and switches into actual anon / authenticated / service_role roles.
// Run: node lib/checkout/checkout-intent-perms.test.mjs
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';

let failures = 0;
const pass = (m) => console.log('PASS ' + m);
const fail = (m) => { console.log('FAIL ' + m); failures++; };
const db = await PGlite.create();
const q = async (sql, p) => (await db.query(sql, p)).rows;

await db.exec(`
  do $$ begin create role anon; exception when duplicate_object then null; end $$;
  do $$ begin create role authenticated; exception when duplicate_object then null; end $$;
  do $$ begin create role service_role; exception when duplicate_object then null; end $$;
  alter role service_role bypassrls;
`);
await db.exec(readFileSync('supabase/migrations/0027_checkout_intent_idempotency.sql', 'utf8'));
await db.exec(`grant all on checkout_intents to anon, authenticated, service_role;`);

const S = '11111111-1111-4111-8111-111111111111';
const T = 'aaaaaaaa-1111-4111-8111-111111111111';
const calls = {
  begin_checkout_intent: `select begin_checkout_intent('${S}','${T}','main_checkout',null,null,0,26900,'EUR',120)`,
  attach_checkout_intent_draft: `select attach_checkout_intent_draft('${S}','${T}','gid://d/1')`,
  resolve_checkout_intent: `select resolve_checkout_intent('${S}','${T}','resolved')`,
  get_checkout_intent: `select get_checkout_intent('${S}')`,
};
async function asRole(role, sql) {
  await db.exec(`set role ${role}`);
  try { await q(sql); return true; } catch { return false; } finally { await db.exec(`reset role`); }
}

for (const [name, sql] of Object.entries(calls)) {
  (await asRole('service_role', sql)) ? pass(`service_role CAN execute ${name}`) : fail(`service_role BLOCKED on ${name}`);
  (!(await asRole('anon', sql))) ? pass(`anon CANNOT execute ${name}`) : fail(`anon CAN execute ${name}`);
  (!(await asRole('authenticated', sql))) ? pass(`authenticated CANNOT execute ${name}`) : fail(`authenticated CAN execute ${name}`);
}

const pub = await q(`
  select p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname in
    ('begin_checkout_intent','attach_checkout_intent_draft','resolve_checkout_intent','get_checkout_intent')
    and has_function_privilege('public', p.oid, 'EXECUTE')`);
pub.length === 0 ? pass('no EXECUTE to PUBLIC on any checkout-intent RPC') : fail('PUBLIC has EXECUTE on: ' + pub.map(r=>r.proname).join(','));

console.log(failures === 0 ? '\nALL CHECKOUT-INTENT-PERMS TESTS PASSED' : `\n${failures} CHECKOUT-INTENT-PERMS TEST(S) FAILED`);
process.exit(failures ? 1 : 0);
