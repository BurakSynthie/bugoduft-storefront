// §OPTION-2 DEFECT-1 + MIGRATION-LINEAGE test. Reproduces the REAL webhook status constraint
// lineage (0015 inline CHECK) and proves 0026 deterministically upgrades it to allow 'reconciled'.
// Uses the ACTUAL constraint semantics from 0015, not a weaker hand-built table.
// Run: node lib/checkout/webhook-migration-lineage.test.mjs
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';

let failures = 0;
const pass = (m) => console.log('PASS ' + m);
const fail = (m) => { console.log('FAIL ' + m); failures++; };
const db = await PGlite.create();
const q = async (sql, p) => (await db.query(sql, p)).rows;
async function insertStatus(status) {
  await db.query(`insert into shopify_webhook_events(topic, shopify_order_id, status, locked_at)
                  values ('orders/paid', $1, $2, now())`, ['ML-' + status + '-' + Math.random(), status]);
}
async function accepts(status) { try { await insertStatus(status); return true; } catch { return false; } }

await db.exec(`
  do $$ begin create role anon; exception when duplicate_object then null; end $$;
  do $$ begin create role authenticated; exception when duplicate_object then null; end $$;
  do $$ begin create role service_role; exception when duplicate_object then null; end $$;
  create or replace function set_updated_at() returns trigger language plpgsql as $$
    begin new.updated_at = now(); return new; end $$;
`);

// ---- REAL 0004 base table + 0015 status column WITH ITS INLINE CHECK (verbatim shapes) ----
await db.exec(`
  create table shopify_webhook_events (
    id uuid primary key default gen_random_uuid(),
    topic text not null,
    shopify_order_id text not null,
    received_at timestamptz not null default now(),
    unique (topic, shopify_order_id)
  );`);
// 0015 exact lines:
await db.exec(`
  alter table shopify_webhook_events add column if not exists status text not null default 'completed'
    check (status in ('processing','completed','failed'));
  alter table shopify_webhook_events add column if not exists locked_at timestamptz;
  alter table shopify_webhook_events add column if not exists updated_at timestamptz not null default now();
`);

// BEFORE 0026: the real 0015 constraint must REJECT 'reconciled'.
(await accepts('completed')) ? pass('§D1 pre-0026: completed accepted') : fail('§D1 pre-0026 completed rejected');
(!(await accepts('reconciled'))) ? pass('§D1 pre-0026: reconciled REJECTED by real 0015 CHECK (bug reproduced)')
                                 : fail('§D1 pre-0026: reconciled unexpectedly accepted (stub too weak)');

// Minimal prerequisites 0026 references (tables it alters / FKs), then apply 0026 verbatim.
await db.exec(`
  create table configurations(id uuid primary key default gen_random_uuid());
  create table sample_orders(id uuid primary key default gen_random_uuid());
  create table orders(id uuid primary key default gen_random_uuid(), shopify_order_id text unique, payment_state text);
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
`);
await db.exec(readFileSync('supabase/migrations/0026_webhook_reconciliation_and_amount_verify.sql', 'utf8'));

// AFTER 0026: reconciled accepted; bogus still rejected; original values still valid.
(await accepts('reconciled')) ? pass('§D1 post-0026: reconciled ACCEPTED') : fail('§D1 post-0026: reconciled still rejected');
(await accepts('completed'))  ? pass('§D1 post-0026: completed still accepted') : fail('§D1 post-0026: completed rejected');
(await accepts('failed'))     ? pass('§D1 post-0026: failed still accepted') : fail('§D1 post-0026: failed rejected');
(await accepts('processing')) ? pass('§D1 post-0026: processing still accepted') : fail('§D1 post-0026: processing rejected');
(!(await accepts('bogus')))   ? pass('§D1 post-0026: bogus STILL rejected (validation preserved)') : fail('§D1 post-0026: bogus accepted (validation lost!)');

// exactly one status CHECK constraint governs the column (no leftover duplicate/omitted).
const checks = await q(`
  select pg_get_constraintdef(con.oid) def from pg_constraint con
  join pg_class rel on rel.oid = con.conrelid where rel.relname='shopify_webhook_events' and con.contype='c'`);
const hasRecon = checks.some(c => /reconciled/.test(c.def));
const hasOld = checks.some(c => /status/.test(c.def) && !/reconciled/.test(c.def));
(hasRecon && !hasOld) ? pass('§D1 exactly the upgraded 4-value CHECK remains (old 3-value gone)')
                      : fail('§D1 constraint set wrong: ' + JSON.stringify(checks.map(c=>c.def)));

console.log(failures === 0 ? '\nALL MIGRATION-LINEAGE TESTS PASSED' : `\n${failures} MIGRATION-LINEAGE TEST(S) FAILED`);
process.exit(failures ? 1 : 0);
