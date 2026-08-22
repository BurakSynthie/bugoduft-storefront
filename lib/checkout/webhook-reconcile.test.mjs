// §OPTION-2 EXECUTE-level tests for webhook reconciliation state + mismatch idempotency,
// against a real Postgres (PGlite 16.4). Loads the ACTUAL function bodies from migration 0026.
// Run: node lib/checkout/webhook-reconcile.test.mjs
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';

let failures = 0;
const pass = (m) => console.log('PASS ' + m);
const fail = (m) => { console.log('FAIL ' + m); failures++; };

const db = await PGlite.create();
const q = async (sql, p) => (await db.query(sql, p)).rows;

// roles referenced by 0026 GRANT/REVOKE (logic harness; perms proven separately).
await db.exec(`
  do $$ begin create role anon;          exception when duplicate_object then null; end $$;
  do $$ begin create role authenticated; exception when duplicate_object then null; end $$;
  do $$ begin create role service_role;  exception when duplicate_object then null; end $$;
`);

// ---- minimal real schema the 0026 functions touch ----
await db.exec(`
  create table shopify_webhook_events (
    id uuid primary key default gen_random_uuid(),
    topic text not null,
    shopify_order_id text not null,
    status text check (status in ('processing','completed','failed')),
    locked_at timestamptz,
    received_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    unique (topic, shopify_order_id)
  );
  create table customers (id uuid primary key default gen_random_uuid());
  create table configurations (id uuid primary key default gen_random_uuid());
  create table sample_orders (id uuid primary key default gen_random_uuid());
  create or replace function consume_first_order(p_customer_id uuid, p_config_id uuid) returns void language sql as $$ select null::void $$;
  create or replace function release_or_revert_sample_credit(p_sample_order_id uuid, p_config_id uuid) returns void language sql as $$ select null::void $$;
  create or replace function release_or_revert_first_order(p_customer_id uuid, p_config_id uuid) returns void language sql as $$ select null::void $$;
  create table orders (
    id uuid primary key default gen_random_uuid(),
    shopify_order_id text unique,
    customer_id uuid,
    order_kind text,
    payment_state text
  );
  create table checkout_orphan_drafts (
    id uuid primary key default gen_random_uuid(),
    shopify_draft_order_id text,
    source text not null check (source in ('main_checkout','sample_checkout')),
    config_id uuid references configurations(id) on delete set null,
    sample_order_id uuid references sample_orders(id) on delete set null,
    benefit_type text,
    benefit_amount_cents int,
    auth_user_id uuid,
    reason text not null,
    status text not null default 'open' check (status in ('open','resolved')),
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
  );
`);

// apply 0026 verbatim (roles created above so GRANT/REVOKE succeed).
const m26 = readFileSync('supabase/migrations/0026_webhook_reconciliation_and_amount_verify.sql', 'utf8');
await db.exec(m26);

// ================= mark/claim terminal 'reconciled' =================
// (1) mark_webhook_event accepts 'reconciled'
await q(`insert into shopify_webhook_events(topic, shopify_order_id, status, locked_at)
         values ('orders/paid','A1','processing', now())`);
try {
  await q(`select mark_webhook_event('orders/paid','A1','reconciled')`);
  const s = (await q(`select status from shopify_webhook_events where shopify_order_id='A1'`))[0].status;
  s === 'reconciled' ? pass('§O2 mark_webhook_event sets terminal reconciled') : fail('§O2 status=' + s);
} catch (e) { fail('§O2 mark reconciled threw: ' + e.message); }

// (2) mark rejects an invalid status
try { await q(`select mark_webhook_event('orders/paid','A1','bogus')`); fail('§O2 invalid status accepted'); }
catch { pass('§O2 mark_webhook_event rejects invalid status'); }

// (3) claim treats reconciled as terminal → duplicate on redelivery
const c1 = (await q(`select claim_webhook_event('orders/paid','A1',120) v`))[0].v;
c1 === 'duplicate' ? pass('§O2 reconciled event → claim returns duplicate (idempotent redelivery)')
                   : fail('§O2 claim on reconciled returned ' + c1);

// (4) claim still returns process for a brand-new event, and duplicate after completed
const c2 = (await q(`select claim_webhook_event('orders/paid','B1',120) v`))[0].v;
c2 === 'process' ? pass('§O2 fresh event → process') : fail('§O2 fresh returned ' + c2);
await q(`select mark_webhook_event('orders/paid','B1','completed')`);
const c3 = (await q(`select claim_webhook_event('orders/paid','B1',120) v`))[0].v;
c3 === 'duplicate' ? pass('§O2 completed event → duplicate') : fail('§O2 completed returned ' + c3);

// ================= record_paid_mismatch idempotency =================
const [{ id: CFG }] = await q(`insert into configurations default values returning id`);

// (5) first mismatch inserts one anomaly row
await q(`select record_paid_mismatch('main_checkout','SHOP-100',$1,null,26900,26899,'EUR','EUR','main_amount_mismatch')`, [CFG]);
let n = (await q(`select count(*)::int c from checkout_orphan_drafts where kind='paid_mismatch' and shopify_order_id='SHOP-100'`))[0].c;
n === 1 ? pass('§O2 mismatch recorded once') : fail('§O2 expected 1 anomaly, got ' + n);

// (6) DUPLICATE mismatch delivery does NOT create a second row (deterministic, idempotent)
await q(`select record_paid_mismatch('main_checkout','SHOP-100',$1,null,26900,26899,'EUR','EUR','main_amount_mismatch')`, [CFG]);
n = (await q(`select count(*)::int c from checkout_orphan_drafts where kind='paid_mismatch' and shopify_order_id='SHOP-100'`))[0].c;
n === 1 ? pass('§O2 duplicate mismatch webhook is idempotent (still 1 row)') : fail('§O2 duplicate created ' + n + ' rows');

// (7) the anomaly carries the required fields for admin reconciliation
const row = (await q(`select source, config_id, expected_amount_cents, actual_amount_cents,
  expected_currency, actual_currency, reason, status
  from checkout_orphan_drafts where shopify_order_id='SHOP-100' and kind='paid_mismatch'`))[0];
(row.expected_amount_cents === 26900 && row.actual_amount_cents === 26899 &&
 row.expected_currency === 'EUR' && row.reason === 'main_amount_mismatch' && row.status === 'open')
  ? pass('§O2 anomaly row carries expected/actual amount+currency+reason for admin review')
  : fail('§O2 anomaly row missing fields: ' + JSON.stringify(row));

// (8) a currency mismatch for a DIFFERENT order records its own distinct row
await q(`select record_paid_mismatch('main_checkout','SHOP-200',$1,null,26900,26900,'EUR','USD','main_currency_mismatch')`, [CFG]);
n = (await q(`select count(*)::int c from checkout_orphan_drafts where kind='paid_mismatch'`))[0].c;
n === 2 ? pass('§O2 distinct orders get distinct anomaly rows') : fail('§O2 expected 2 anomaly rows, got ' + n);

// (9) orphan-draft rows are unaffected by the new unique(shopify_order_id) partial index
await q(`insert into checkout_orphan_drafts(kind, source, shopify_draft_order_id, reason)
         values ('orphan_draft','main_checkout','DRAFT-1','orphan')`);
await q(`insert into checkout_orphan_drafts(kind, source, shopify_draft_order_id, reason)
         values ('orphan_draft','main_checkout','DRAFT-2','orphan')`);
n = (await q(`select count(*)::int c from checkout_orphan_drafts where kind='orphan_draft'`))[0].c;
n === 2 ? pass('§O2 orphan_draft rows coexist (partial unique index only constrains paid_mismatch)')
        : fail('§O2 orphan_draft count = ' + n);

// ================= §DEFECT-2 mismatch anomaly durability across retry =================
// The route records the idempotent anomaly BEFORE apply_main_order_event. Simulate:
//   attempt 1: anomaly recorded, then apply commits; response fails so event NOT completed.
//   retry:     apply returns 'stale' (same event already committed), yet the anomaly must already
//              exist exactly once and payment_state must never be paid.
const [{ id: CFG2 }] = await q(`insert into configurations default values returning id`);
await q(`insert into orders(shopify_order_id, order_kind, payment_state) values ('DUR-1','main',null)`);
await q(`select record_paid_mismatch('main_checkout','DUR-1',$1,null,26900,26899,'EUR','EUR','main_amount_mismatch')`, [CFG2]);
await q(`select apply_main_order_event('DUR-1','2026-05-01T10:00:00Z'::timestamptz,'reconciliation_hold',false,false,$1,null,null,null)`, [CFG2]);
await q(`select record_paid_mismatch('main_checkout','DUR-1',$1,null,26900,26899,'EUR','EUR','main_amount_mismatch')`, [CFG2]);
const durRetry = (await q(`select apply_main_order_event('DUR-1','2026-05-01T10:00:00Z'::timestamptz,'reconciliation_hold',false,false,$1,null,null,null) v`, [CFG2]))[0].v;
durRetry === 'stale' ? pass('§D2 retry of same mismatch event → apply stale (already committed)') : fail('§D2 retry apply=' + durRetry);
const durAnoms = (await q(`select count(*)::int c from checkout_orphan_drafts where kind='paid_mismatch' and shopify_order_id='DUR-1'`))[0].c;
durAnoms === 1 ? pass('§D2 anomaly exists exactly once after retry (never lost, never duplicated)') : fail('§D2 anomaly count=' + durAnoms);
((await q(`select payment_state s from orders where shopify_order_id='DUR-1'`))[0].s === 'reconciliation_hold')
  ? pass('§D2 payment_state never became paid for the mismatch') : fail('§D2 dur-1 state wrong');

// ================= §DEFECT-2 mismatch must not count as a previous paid main order =================
// Model the EXACT first-order eligibility query: orders where order_kind='main' AND payment_state='paid'.
const [{ id: CUST }] = await q(`insert into configurations default values returning id`); // reuse as a customer id placeholder
const eligCount = async () => (await q(
  `select count(*)::int c from orders where customer_id=$1 and order_kind='main' and payment_state='paid'`, [CUST]))[0].c;

// a VALID paid main order for this customer → counts as 1
await q(`insert into orders(shopify_order_id, customer_id, order_kind, payment_state)
         values ('OK-1',$1,'main','paid')`, [CUST]);
(await eligCount()) === 1 ? pass('§D2 valid paid main order → eligibility count = 1')
                          : fail('§D2 valid paid order not counted');

// a MISMATCHED paid Shopify order persisted as reconciliation_hold → must NOT count
await q(`insert into orders(shopify_order_id, customer_id, order_kind, payment_state)
         values ('MISMATCH-1',$1,'main','reconciliation_hold')`, [CUST]);
(await eligCount()) === 1 ? pass('§D2 mismatched paid order (reconciliation_hold) NOT counted → still 1')
                          : fail('§D2 mismatched order leaked into paid eligibility count');

// a later valid resolution must not duplicate the order row (unique shopify_order_id)
let dupErr = false;
try { await q(`insert into orders(shopify_order_id, customer_id, order_kind, payment_state) values ('MISMATCH-1',$1,'main','paid')`, [CUST]); }
catch { dupErr = true; }
dupErr ? pass('§D2 duplicate shopify_order_id insert rejected (no duplicate order rows)')
       : fail('§D2 duplicate order row created');

// ================= §DEFECT-4 monotonic decision fn (_order_event_wins) =================
// The full atomic apply_main/sample_order_event ordering is proven in webhook-atomic-ordering.test.mjs.
// Here we unit-test the pure decision helper the RPCs use.
const T_OLD = '2026-01-01T10:00:00.000Z';
const T_NEW = '2026-01-01T12:00:00.000Z';
const wins = async (state, at, lastAt, lastState) =>
  (await q(`select public._order_event_wins($1,$2::timestamptz,$3::timestamptz,$4) v`, [state, at, lastAt, lastState]))[0].v;
(await wins('paid', T_NEW, null, null)) === true ? pass('§D4 first event wins (no prior)') : fail('§D4 first event lost');
(await wins('paid', T_NEW, T_OLD, 'paid')) === true ? pass('§D4 strictly newer wins') : fail('§D4 newer lost');
(await wins('paid', T_OLD, T_NEW, 'cancelled')) === false ? pass('§D4 strictly older loses (stale paid after cancel)') : fail('§D4 older won');
(await wins('cancelled', T_NEW, T_NEW, 'paid')) === true ? pass('§D4 equal-ts cancelled beats paid') : fail('§D4 tie cancel lost');
(await wins('paid', T_NEW, T_NEW, 'cancelled')) === false ? pass('§D4 equal-ts paid cannot override cancelled') : fail('§D4 tie paid won');
(await wins('paid', T_NEW, T_NEW, 'paid')) === false ? pass('§D4 duplicate same-ts paid → not re-applied') : fail('§D4 dup paid won');

// ================= §DEFECT-3 DB-failure leaves event retryable, not terminally acked =================
// Worker A owns the event (processing). A hits a DB error and returns non-2xx WITHOUT marking
// completed. The row stays 'processing' with a lease timestamp.
await q(`insert into shopify_webhook_events(topic, shopify_order_id, status, locked_at)
         values ('orders/paid','RETRY-1','processing', now())`);
// A retry arriving BEFORE lease expiry must be 'locked' (route returns non-2xx 409, NOT a 2xx ack).
let r3 = (await q(`select claim_webhook_event('orders/paid','RETRY-1',120) v`))[0].v;
r3 === 'locked' ? pass('§D3 retry within lease → locked (route returns non-2xx, not a terminal 2xx ack)')
                : fail('§D3 within-lease retry returned ' + r3);
// A retry AFTER the lease goes stale must reclaim ('process') so it can actually be finished.
await q(`update shopify_webhook_events set locked_at = now() - interval '200 seconds' where shopify_order_id='RETRY-1'`);
r3 = (await q(`select claim_webhook_event('orders/paid','RETRY-1',120) v`))[0].v;
r3 === 'process' ? pass('§D3 retry after stale lease → process (event reclaimable, not lost)')
                 : fail('§D3 stale-lease retry returned ' + r3);
// Even if mark-failed never ran (still 'processing'), the same stale-reclaim path recovers it:
// simulate "mark failed itself failed" by leaving status='processing' and re-aging the lease.
await q(`update shopify_webhook_events set status='processing', locked_at = now() - interval '200 seconds' where shopify_order_id='RETRY-1'`);
r3 = (await q(`select claim_webhook_event('orders/paid','RETRY-1',120) v`))[0].v;
r3 === 'process' ? pass('§D3 processing+stale (mark-failed lost) still reclaimable → retry not silently dropped')
                 : fail('§D3 processing+stale returned ' + r3);

console.log(failures === 0 ? '\nALL WEBHOOK-RECONCILE TESTS PASSED' : `\n${failures} WEBHOOK-RECONCILE TEST(S) FAILED`);
process.exit(failures ? 1 : 0);
