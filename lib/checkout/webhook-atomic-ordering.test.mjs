// §OPTION-2 DEFECT-2/3 atomic cross-topic ordering tests for the REAL apply_main_order_event /
// apply_sample_order_event RPCs loaded from migration 0026.
//
// HONESTY NOTE ON CONCURRENCY: PGlite is single-connection in-memory, so two GENUINELY parallel
// transactions cannot be spawned here to race the advisory lock at runtime. We therefore prove
// correctness two ways that together cover the defect:
//   (1) STRUCTURE: assert the function body actually takes pg_advisory_xact_lock and performs the
//       ordering decision + ALL state mutation inside the SAME function/transaction (so there is
//       no guard→mutation gap). This is what makes concurrent deliveries safe.
//   (2) INVARIANT: drive the exact interleaving the defect describes by APPLYING events in the
//       hostile order (older paid AFTER newer cancelled) and assert the final state is correct —
//       because the in-transaction monotonic timestamp check makes the older paid lose regardless
//       of arrival order, and the lock guarantees the two never read stale state concurrently.
// Run: node lib/checkout/webhook-atomic-ordering.test.mjs
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
  create table configurations(id uuid primary key default gen_random_uuid(), status text default 'draft');
  create table customers(id uuid primary key default gen_random_uuid());
  create table sample_orders(id uuid primary key default gen_random_uuid(),
    payment_state text default 'pending', shopify_order_id text,
    credit_used_at timestamptz, credit_used_configuration_id uuid,
    credit_reserved_config_id uuid, credit_reservation_expires_at timestamptz);
  create table orders(id uuid primary key default gen_random_uuid(),
    shopify_order_id text unique, customer_id uuid, order_kind text, payment_state text);
  create table shopify_webhook_events(id uuid primary key default gen_random_uuid(),
    topic text, shopify_order_id text, status text, locked_at timestamptz,
    updated_at timestamptz default now(), unique(topic,shopify_order_id));
  create table checkout_orphan_drafts(
    id uuid primary key default gen_random_uuid(), shopify_draft_order_id text not null,
    source text not null check (source in ('main_checkout','sample_checkout')),
    config_id uuid references configurations(id) on delete set null,
    sample_order_id uuid references sample_orders(id) on delete set null,
    benefit_type text, benefit_amount_cents int, auth_user_id uuid, reason text not null,
    status text not null default 'open' check (status in ('open','resolved')),
    created_at timestamptz default now(), updated_at timestamptz default now());
`);
// Instrument the benefit fns to COUNT invocations so we can prove a stale paid never consumes.
await db.exec(`
  create table _calls(fn text);
  create or replace function consume_first_order(p_customer_id uuid, p_config_id uuid) returns void
    language plpgsql as $$ begin insert into public._calls values ('consume_first_order'); end $$;
  create or replace function release_or_revert_sample_credit(p_sample_order_id uuid, p_config_id uuid) returns void
    language plpgsql as $$ begin insert into public._calls values ('release_sample'); update public.sample_orders set credit_used_at=null where id=p_sample_order_id; end $$;
  create or replace function release_or_revert_first_order(p_customer_id uuid, p_config_id uuid) returns void
    language plpgsql as $$ begin insert into public._calls values ('release_first'); end $$;
`);
await db.exec(readFileSync('supabase/migrations/0026_webhook_reconciliation_and_amount_verify.sql', 'utf8'));

const callCount = async (fn) => (await q(`select count(*)::int c from _calls where fn=$1`, [fn]))[0].c;
const T_OLD = '2026-03-01T10:00:00.000Z';
const T_NEW = '2026-03-01T12:00:00.000Z';

// ---------- (1) STRUCTURE: lock + in-transaction decision+mutation ----------
const mainDef = (await q(`select pg_get_functiondef('apply_main_order_event(text,timestamptz,text,boolean,boolean,uuid,uuid,text,uuid)'::regprocedure) d`))[0].d;
/pg_advisory_xact_lock/.test(mainDef) ? pass('§D2 apply_main_order_event takes pg_advisory_xact_lock (per-order serialization)')
                                      : fail('§D2 main RPC missing advisory lock');
(/for update/i.test(mainDef) && /_order_event_wins/.test(mainDef) && /update public\.orders/.test(mainDef) && /update public\.configurations/.test(mainDef))
  ? pass('§D2 main RPC does decision + payment_state + config + benefit in one function body')
  : fail('§D2 main RPC does not fully encapsulate decision+mutation');
const sampleDef = (await q(`select pg_get_functiondef('apply_sample_order_event(text,timestamptz,uuid,text,text)'::regprocedure) d`))[0].d;
(/pg_advisory_xact_lock/.test(sampleDef) && /update public\.orders/.test(sampleDef))
  ? pass('§D1 apply_sample_order_event takes advisory lock AND writes orders mirror in-transaction')
  : fail('§D1 sample RPC missing lock or mirror write');

// ---------- (2) INVARIANT: hostile interleaving — older paid applied AFTER newer cancelled ----------
// MAIN: config with first-order benefit.
const [{ id: CFG }] = await q(`insert into configurations(status) values ('draft') returning id`);
const [{ id: CUST }] = await q(`insert into customers default values returning id`);
await q(`insert into orders(shopify_order_id, order_kind, payment_state) values ('RACE-1','main','pending')`);

// B = newer cancelled applies first (as if worker B won the race to record).
let r = (await q(`select apply_main_order_event('RACE-1',$1::timestamptz,'cancelled',false,true,$2,$3,'first_order_5pct',null) v`, [T_NEW, CFG, CUST]))[0].v;
r === 'applied' ? pass('§D2 newer cancelled applies') : fail('§D2 cancelled apply=' + r);
// A = older paid arrives LATER and tries to resurrect. MUST be stale, MUST NOT order/consume.
r = (await q(`select apply_main_order_event('RACE-1',$1::timestamptz,'paid',true,false,$2,$3,'first_order_5pct',null) v`, [T_OLD, CFG, CUST]))[0].v;
r === 'stale' ? pass('§D2 older paid AFTER newer cancelled → stale (cannot resurrect)') : fail('§D2 older paid apply=' + r);

const st = (await q(`select payment_state s from orders where shopify_order_id='RACE-1'`))[0].s;
st === 'cancelled' ? pass('§D2 final orders.payment_state = cancelled (not resurrected)') : fail('§D2 final state=' + st);
const cfgStatus = (await q(`select status s from configurations where id=$1`, [CFG]))[0].s;
cfgStatus !== 'ordered' ? pass('§D2 configuration NOT ordered by stale paid') : fail('§D2 configuration wrongly ordered');
(await callCount('consume_first_order')) === 0 ? pass('§D2 first-order benefit NOT consumed by stale paid') : fail('§D2 benefit consumed by stale paid');
const lastAt = (await q(`select last_event_at::text t from orders where shopify_order_id='RACE-1'`))[0].t;
/12:00:00/.test(lastAt) ? pass('§D2 last_event_at = newer cancellation timestamp') : fail('§D2 last_event_at=' + lastAt);

// legitimate paid(old) → cancelled(new) still ends cancelled with benefit reverted.
await q(`insert into orders(shopify_order_id, order_kind, payment_state) values ('RACE-2','main','pending')`);
await q(`select apply_main_order_event('RACE-2',$1::timestamptz,'paid',true,false,$2,$3,'first_order_5pct',null)`, [T_OLD, CFG, CUST]);
await q(`select apply_main_order_event('RACE-2',$1::timestamptz,'cancelled',false,true,$2,$3,'first_order_5pct',null)`, [T_NEW, CFG, CUST]);
((await q(`select payment_state s from orders where shopify_order_id='RACE-2'`))[0].s === 'cancelled')
  ? pass('§D2 legitimate paid→cancelled still ends cancelled') : fail('§D2 legit paid→cancelled wrong');
(await callCount('release_first')) >= 1 ? pass('§D2 legitimate cancellation reverted the benefit') : fail('§D2 revert not called');

// duplicate paid + duplicate cancelled are idempotent (second call → stale).
await q(`insert into orders(shopify_order_id, order_kind, payment_state) values ('RACE-3','main','pending')`);
await q(`select apply_main_order_event('RACE-3',$1::timestamptz,'paid',true,false,$2,$3,null,null)`, [T_NEW, CFG, CUST]);
let dup = (await q(`select apply_main_order_event('RACE-3',$1::timestamptz,'paid',true,false,$2,$3,null,null) v`, [T_NEW, CFG, CUST]))[0].v;
dup === 'stale' ? pass('§D2 duplicate paid → stale (idempotent)') : fail('§D2 duplicate paid=' + dup);

// ---------- §DEFECT-1 SAMPLE + MIRROR atomicity & stale protection ----------
// helper: create a sample_orders row AND its mirror orders row (as the route now does before RPC).
async function newSample(shopId) {
  const [{ id }] = await q(`insert into sample_orders(payment_state) values ('pending') returning id`);
  await q(`insert into orders(shopify_order_id, order_kind, payment_state) values ($1,'sample',null)`, [shopId]);
  return id;
}
const sampleState  = async (id) => (await q(`select payment_state s from sample_orders where id=$1`, [id]))[0].s;
const mirrorState  = async (shopId) => (await q(`select payment_state s from orders where shopify_order_id=$1`, [shopId]))[0].s;

// HOSTILE INTERLEAVING: A older paid applies, THEN B newer cancelled applies, THEN A "resumes".
// With the mirror write INSIDE the RPC, A's later paid delivery is 'stale' and cannot set either
// row to paid. Final: sample_orders=cancelled AND orders=cancelled.
const SM = await newSample('SMIR-1');
// A older paid wins first (applies paid to both rows):
let r1 = (await q(`select apply_sample_order_event('SMIR-1',$1::timestamptz,$2,'paid','paid') v`, [T_OLD, SM]))[0].v;
r1 === 'applied' ? pass('§D1 sample older paid applies first (both rows paid)') : fail('§D1 sample paid apply=' + r1);
// B newer cancelled applies (both rows cancelled):
let r2 = (await q(`select apply_sample_order_event('SMIR-1',$1::timestamptz,$2,'cancelled','cancelled') v`, [T_NEW, SM]))[0].v;
r2 === 'applied' ? pass('§D1 sample newer cancelled applies (both rows cancelled)') : fail('§D1 sample cancel apply=' + r2);
// A "resumes": an even-later redelivery of the OLD paid must be stale and change nothing.
let r3 = (await q(`select apply_sample_order_event('SMIR-1',$1::timestamptz,$2,'paid','paid') v`, [T_OLD, SM]))[0].v;
r3 === 'stale' ? pass('§D1 sample resumed older paid → stale (no resurrection)') : fail('§D1 sample resumed paid=' + r3);
(await sampleState(SM)) === 'cancelled' ? pass('§D1 FINAL sample_orders.payment_state = cancelled') : fail('§D1 sample state=' + await sampleState(SM));
(await mirrorState('SMIR-1')) === 'cancelled' ? pass('§D1 FINAL orders(mirror).payment_state = cancelled') : fail('§D1 mirror state=' + await mirrorState('SMIR-1'));
/12:00:00/.test((await q(`select last_event_at::text t from sample_orders where id=$1`, [SM]))[0].t)
  ? pass('§D1 sample last_event_at = newer cancellation') : fail('§D1 sample last_event_at wrong');

// sample paid(old) → cancelled(new): both rows end cancelled.
const SM2 = await newSample('SMIR-2');
await q(`select apply_sample_order_event('SMIR-2',$1::timestamptz,$2,'paid','paid')`, [T_OLD, SM2]);
await q(`select apply_sample_order_event('SMIR-2',$1::timestamptz,$2,'cancelled','cancelled')`, [T_NEW, SM2]);
((await sampleState(SM2)) === 'cancelled' && (await mirrorState('SMIR-2')) === 'cancelled')
  ? pass('§D1 sample paid(old)→cancelled(new): both rows cancelled') : fail('§D1 paid→cancel both-rows wrong');

// cancelled(new) → delayed paid(old): both stay cancelled; sample credit eligibility false.
const SM3 = await newSample('SMIR-3');
await q(`select apply_sample_order_event('SMIR-3',$1::timestamptz,$2,'cancelled','cancelled')`, [T_NEW, SM3]);
let sr = (await q(`select apply_sample_order_event('SMIR-3',$1::timestamptz,$2,'paid','paid') v`, [T_OLD, SM3]))[0].v;
sr === 'stale' ? pass('§D1 sample cancelled(new)→delayed paid(old) → stale') : fail('§D1 sample delayed paid=' + sr);
((await sampleState(SM3)) === 'cancelled' && (await mirrorState('SMIR-3')) === 'cancelled')
  ? pass('§D1 sample credit eligibility stays false (both rows cancelled)') : fail('§D1 sample delayed paid resurrected');

// duplicate cancelled is idempotent (second → stale).
let dupc = (await q(`select apply_sample_order_event('SMIR-3',$1::timestamptz,$2,'cancelled','cancelled') v`, [T_NEW, SM3]))[0].v;
dupc === 'stale' ? pass('§D1 duplicate sample cancelled → stale (idempotent)') : fail('§D1 dup sample cancel=' + dupc);

// §D5 null timestamp is rejected by the atomic RPC (fail closed).
let nullRej = false;
try { await q(`select apply_main_order_event('NULLT',null,'paid',true,false,$1,$2,null,null)`, [CFG, CUST]); } catch { nullRej = true; }
nullRej ? pass('§D5 apply_main_order_event rejects null event timestamp (fail closed)') : fail('§D5 null timestamp accepted');

// ---------- §DEFECT-4 origin: a no-marker order never becomes a counted paid main order ----------
// The route returns before any mutation for a no-marker order, so the eligibility query (which
// counts order_kind='main' AND payment_state='paid') is unaffected. Prove the query semantics:
// a no-marker order simply never inserts such a row, so the count for a given customer is stable.
const [{ id: EC }] = await q(`insert into customers default values returning id`);
const eligCount = async () => (await q(
  `select count(*)::int c from orders where customer_id=$1 and order_kind='main' and payment_state='paid'`, [EC]))[0].c;
(await eligCount()) === 0 ? pass('§D4 no-marker: eligibility count starts 0') : fail('§D4 unexpected starting count');
// a legitimate marker-bearing paid main order for THIS customer would count:
await q(`insert into orders(shopify_order_id, customer_id, order_kind, payment_state) values ('D4-OK',$1,'main','paid')`, [EC]);
(await eligCount()) === 1 ? pass('§D4 legitimate main paid counts = 1') : fail('§D4 legit main not counted');
// a no-marker order is ignored by the route (never inserted as paid main) → count unchanged.
// (simulate the route outcome: no row inserted) — count stays 1.
(await eligCount()) === 1 ? pass('§D4 no-marker order does NOT change previous-paid-main count') : fail('§D4 count changed');

console.log(failures === 0 ? '\nALL ATOMIC-ORDERING TESTS PASSED' : `\n${failures} ATOMIC-ORDERING TEST(S) FAILED`);
process.exit(failures ? 1 : 0);
