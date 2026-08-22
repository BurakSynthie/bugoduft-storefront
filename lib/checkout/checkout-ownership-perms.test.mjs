// §OPTION-3-v2 REAL role/EXECUTE permission test for the 0028 checkout-ownership RPCs.
// Run: node lib/checkout/checkout-ownership-perms.test.mjs
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';

let failures = 0;
const pass = (m) => console.log('PASS ' + m);
const fail = (m) => { console.log('FAIL ' + m); failures++; };
const db = await PGlite.create();
const q = async (sql, p) => (await db.query(sql, p)).rows;

await db.exec(`
  do $$ begin create type locale as enum ('de','en','fr'); exception when duplicate_object then null; end $$;
  do $$ begin create role anon; exception when duplicate_object then null; end $$;
  do $$ begin create role authenticated; exception when duplicate_object then null; end $$;
  do $$ begin create role service_role; exception when duplicate_object then null; end $$;
  alter role service_role bypassrls;
  create table configurations(id uuid primary key default gen_random_uuid(), shopify_cart_id text, status text default 'draft', checkout_lock_token uuid, checkout_lock_at timestamptz);
  create table sample_orders(id uuid primary key default gen_random_uuid(), payment_state text, shopify_draft_order_id text, shopify_invoice_url text, amount_cents int, credit_cents int, currency text default 'EUR', auth_user_id uuid, customer_id uuid, email text, locale locale, idempotency_key uuid);
  create table checkout_intents(config_id uuid primary key, source text, sample_order_id uuid, token uuid, status text, shopify_draft_order_id text, benefit_type text, benefit_amount_cents int, expected_total_cents int, expected_currency text, updated_at timestamptz default now());
  create table checkout_orphan_drafts(id uuid primary key default gen_random_uuid(), shopify_draft_order_id text, kind text default 'orphan_draft', source text, config_id uuid, sample_order_id uuid, status text default 'open');
`);
await db.exec(readFileSync('supabase/migrations/0028_checkout_ownership_and_benefit_risk.sql', 'utf8'));
await db.exec(readFileSync('supabase/migrations/0029_checkout_state_machine_final.sql', 'utf8'));
await db.exec(`grant all on configurations, sample_orders, checkout_intents, checkout_orphan_drafts to anon, authenticated, service_role;`);

const C = '11111111-1111-4111-8111-111111111111';
const T = 'aaaaaaaa-1111-4111-8111-111111111111';
const K = 'cccccccc-3333-4333-8333-333333333333';
const calls = {
  prior_config_payment_risk: `select prior_config_payment_risk('${C}')`,
  supersede_prior_config_draft: `select supersede_prior_config_draft('${C}','gid://d/1')`,
  get_or_create_sample_order: `select get_or_create_sample_order('${K}',null,null,'a@b.co','de',4000,2000)`,
  persist_config_draft_owned: `select persist_config_draft_owned('${C}','${T}','gid://d/1')`,
  resolve_config_intent_owned: `select resolve_config_intent_owned('${C}','${T}')`,
  set_sample_invoice: `select set_sample_invoice('${C}','gid://d/1','https://x')`,
  certify_prior_config_superseded: `select certify_prior_config_superseded('${C}','gid://d/1')`,
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
    ('prior_config_payment_risk','supersede_prior_config_draft','get_or_create_sample_order','persist_config_draft_owned','resolve_config_intent_owned','set_sample_invoice','certify_prior_config_superseded')
    and has_function_privilege('public', p.oid, 'EXECUTE')`);
pub.length === 0 ? pass('no EXECUTE to PUBLIC on any 0028 RPC') : fail('PUBLIC has EXECUTE on: ' + pub.map(r=>r.proname).join(','));

console.log(failures === 0 ? '\nALL CHECKOUT-OWNERSHIP-PERMS TESTS PASSED' : `\n${failures} CHECKOUT-OWNERSHIP-PERMS TEST(S) FAILED`);
process.exit(failures ? 1 : 0);
