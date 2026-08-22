// §OPTION-2 DEFECT-1 REAL role/EXECUTE permission regression test.
// Unlike webhook-reconcile.test.mjs (which runs as owner), this KEEPS the GRANT/REVOKE
// statements and switches into actual anon / authenticated / service_role roles to prove the
// production permission surface. PGlite's service_role is given BYPASSRLS to mirror Supabase.
// Run: node lib/checkout/webhook-perms.test.mjs
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
  create table configurations(id uuid primary key default gen_random_uuid());
  create table sample_orders(id uuid primary key default gen_random_uuid(),
    payment_state text, shopify_order_id text, last_event_at timestamptz, last_event_state text);
  create table shopify_webhook_events(id uuid primary key default gen_random_uuid(),
    topic text, shopify_order_id text, status text check (status in ('processing','completed','failed')),
    locked_at timestamptz, updated_at timestamptz default now(), unique(topic,shopify_order_id));
  create table orders(id uuid primary key default gen_random_uuid(),
    shopify_order_id text unique, payment_state text, last_event_at timestamptz, last_event_state text);
  create table checkout_orphan_drafts(
    id uuid primary key default gen_random_uuid(), shopify_draft_order_id text not null,
    source text not null check (source in ('main_checkout','sample_checkout')),
    config_id uuid references configurations(id) on delete set null,
    sample_order_id uuid references sample_orders(id) on delete set null,
    benefit_type text, benefit_amount_cents int, auth_user_id uuid, reason text not null,
    status text not null default 'open' check (status in ('open','resolved')),
    created_at timestamptz default now(), updated_at timestamptz default now());
  -- benefit fns referenced by apply_main_order_event:
  create or replace function consume_first_order(p_customer_id uuid, p_config_id uuid) returns void language sql as $$ select null::void $$;
  create or replace function release_or_revert_sample_credit(p_sample_order_id uuid, p_config_id uuid) returns void language sql as $$ select null::void $$;
  create or replace function release_or_revert_first_order(p_customer_id uuid, p_config_id uuid) returns void language sql as $$ select null::void $$;
  -- roles need table privileges so that a permission FAILURE is proven to come from the
  -- FUNCTION execute grant, not from a missing table grant:
  grant all on configurations, sample_orders, shopify_webhook_events, orders, checkout_orphan_drafts
    to anon, authenticated, service_role;
`);

// Apply 0026 VERBATIM — including all GRANT/REVOKE. This is the whole point of this test.
await db.exec(readFileSync('supabase/migrations/0026_webhook_reconciliation_and_amount_verify.sql', 'utf8'));

async function asRole(role, fn) {
  await db.exec(`set role ${role}`);
  try { return await fn(); }
  finally { await db.exec(`reset role`); }
}
async function canExec(role, call) {
  try { await asRole(role, () => q(call)); return true; }
  catch { await db.exec(`reset role`); return false; }
}

const MM = `select record_paid_mismatch('main_checkout','PERM-1',null,null,100,99,'EUR','EUR','r')`;
const MW = `select mark_webhook_event('orders/paid','PERM-1','completed')`;
const CW = `select claim_webhook_event('orders/paid','PERM-2',120)`;
const GE = `select apply_main_order_event('PERM-3', now(), 'paid', false, false, null, null, null, null)`;
const RE = `select apply_sample_order_event('PERM-4', now(), null, 'pending', 'pending')`;

// service_role MUST be able to execute all webhook RPCs.
(await canExec('service_role', MM)) ? pass('§D1 service_role CAN execute record_paid_mismatch') : fail('§D1 service_role BLOCKED on record_paid_mismatch');
(await canExec('service_role', MW)) ? pass('§D1 service_role CAN execute mark_webhook_event') : fail('§D1 service_role BLOCKED on mark_webhook_event');
(await canExec('service_role', CW)) ? pass('§D1 service_role CAN execute claim_webhook_event') : fail('§D1 service_role BLOCKED on claim_webhook_event');
(await canExec('service_role', GE)) ? pass('§D1 service_role CAN execute apply_main_order_event') : fail('§D1 service_role BLOCKED on apply_main_order_event');
(await canExec('service_role', RE)) ? pass('§D1 service_role CAN execute apply_sample_order_event') : fail('§D1 service_role BLOCKED on apply_sample_order_event');

// anon / authenticated MUST NOT.
for (const [label, call] of [['record_paid_mismatch', MM], ['mark_webhook_event', MW], ['claim_webhook_event', CW], ['apply_main_order_event', GE], ['apply_sample_order_event', RE]]) {
  (!(await canExec('anon', call)))          ? pass(`§D1 anon CANNOT execute ${label}`)          : fail(`§D1 anon CAN execute ${label} (should be denied)`);
  (!(await canExec('authenticated', call))) ? pass(`§D1 authenticated CANNOT execute ${label}`) : fail(`§D1 authenticated CAN execute ${label} (should be denied)`);
}

// PUBLIC does not grant indirect access: confirm no EXECUTE to PUBLIC remains on these fns.
const pub = await q(`
  select p.proname from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname='public'
    and p.proname in ('record_paid_mismatch','mark_webhook_event','claim_webhook_event','apply_main_order_event','apply_sample_order_event')
    and has_function_privilege('public', p.oid, 'EXECUTE')`);
(pub.length === 0) ? pass('§D1 no EXECUTE to PUBLIC on any webhook RPC') : fail('§D1 PUBLIC still has EXECUTE on: ' + pub.map(r=>r.proname).join(','));

console.log(failures === 0 ? '\nALL WEBHOOK-PERMS TESTS PASSED' : `\n${failures} WEBHOOK-PERMS TEST(S) FAILED`);
process.exit(failures ? 1 : 0);
