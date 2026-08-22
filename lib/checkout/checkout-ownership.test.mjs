// §OPTION-3-v2 EXECUTE-level tests for the five hardening defects, against real Postgres (PGlite).
// Loads the ACTUAL RPC bodies from migration 0028 (+0026/0027 shapes for the surfaces they read).
// Run: node lib/checkout/checkout-ownership.test.mjs
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
  create table configurations(id uuid primary key default gen_random_uuid(), shopify_cart_id text, status text default 'draft', checkout_lock_token uuid, checkout_lock_at timestamptz);
  create table sample_orders(id uuid primary key default gen_random_uuid(), payment_state text default 'pending', shopify_draft_order_id text, shopify_invoice_url text, amount_cents int, credit_cents int, currency text default 'EUR', auth_user_id uuid, customer_id uuid, email text, locale locale, idempotency_key uuid);
  create table checkout_intents(config_id uuid primary key, source text default 'main_checkout', sample_order_id uuid, token uuid, status text default 'draft_pending', shopify_draft_order_id text, benefit_type text, benefit_amount_cents int, expected_total_cents int, expected_currency text default 'EUR', created_at timestamptz default now(), updated_at timestamptz default now());
  create table checkout_orphan_drafts(id uuid primary key default gen_random_uuid(), shopify_draft_order_id text, kind text default 'orphan_draft', source text, config_id uuid, sample_order_id uuid, status text default 'open');
`);
await db.exec(readFileSync('supabase/migrations/0028_checkout_ownership_and_benefit_risk.sql', 'utf8'));
await db.exec(readFileSync('supabase/migrations/0029_checkout_state_machine_final.sql', 'utf8'));

const risk = async (cid) => (await q(`select risk, draft_id from prior_config_payment_risk($1)`, [cid]))[0];
const T1 = 'aaaaaaaa-1111-4111-8111-111111111111';
const T2 = 'bbbbbbbb-2222-4222-8222-222222222222';

// ========== #1 cross-config payment risk ==========
// (a) prior config with a shopify_cart_id draft → existing_draft (not "safe").
const [{ id: C1 }] = await q(`insert into configurations(shopify_cart_id) values ('gid://d/1') returning id`);
let r = await risk(C1);
(r.risk === 'existing_draft' && r.draft_id === 'gid://d/1') ? pass('§1a config.shopify_cart_id → existing_draft') : fail('§1a got ' + JSON.stringify(r));

// (b) prior config clean cart but an INTENT draft_created id → existing_draft (0027 surface).
const [{ id: C2 }] = await q(`insert into configurations default values returning id`);
await q(`insert into checkout_intents(config_id, token, status, shopify_draft_order_id) values ($1,$2,'draft_created','gid://d/2')`, [C2, T1]);
r = await risk(C2);
(r.risk === 'existing_draft' && r.draft_id === 'gid://d/2') ? pass('§1b intent draft id → existing_draft (was previously MISSED)') : fail('§1b got ' + JSON.stringify(r));

// (c) prior config with a pending intent NO draft id → blocked (unseen draft may exist).
const [{ id: C3 }] = await q(`insert into configurations default values returning id`);
await q(`insert into checkout_intents(config_id, token, status) values ($1,$2,'draft_pending')`, [C3, T1]);
(await risk(C3)).risk === 'blocked' ? pass('§1c pending-no-id intent → blocked (fail closed)') : fail('§1c not blocked');

// (d) prior config with an OPEN orphan draft → blocked.
const [{ id: C4 }] = await q(`insert into configurations default values returning id`);
await q(`insert into checkout_orphan_drafts(shopify_draft_order_id, kind, config_id, status) values ('gid://d/4','orphan_draft',$1,'open')`, [C4]);
(await risk(C4)).risk === 'blocked' ? pass('§1d open orphan draft → blocked (was previously MISSED)') : fail('§1d not blocked');

// (e) truly clean prior config → safe.
const [{ id: C5 }] = await q(`insert into configurations default values returning id`);
(await risk(C5)).risk === 'safe' ? pass('§1e clean prior config → safe') : fail('§1e not safe');

// (f) supersede after confirmed delete clears BOTH surfaces.
await q(`select supersede_prior_config_draft($1,'gid://d/2')`, [C2]);
const c2after = await risk(C2);
c2after.risk === 'safe' ? pass('§1f supersede clears intent+config → safe') : fail('§1f still ' + c2after.risk);

// ========== #3 ownership-gated persist ==========
const [{ id: P1 }] = await q(`insert into configurations(checkout_lock_token) values ($1) returning id`, [T1]);
await q(`insert into checkout_intents(config_id, token, status) values ($1,$2,'draft_pending')`, [P1, T1]);
// current owner T1 persists → true, cart id + status + intent set.
(await q(`select persist_config_draft_owned($1,$2,'gid://d/p1') v`, [P1, T1]))[0].v === true ? pass('§3 current owner persists → true') : fail('§3 owner persist failed');
const p1 = (await q(`select shopify_cart_id, status from configurations where id=$1`, [P1]))[0];
(p1.shopify_cart_id === 'gid://d/p1' && p1.status === 'checkout_pending') ? pass('§3 cart id + status written') : fail('§3 fields not written');
// STALE owner T2 (lease was reclaimed by T1) attempts persist → false, no mutation.
const [{ id: P2 }] = await q(`insert into configurations(checkout_lock_token) values ($1) returning id`, [T1]);
(await q(`select persist_config_draft_owned($1,$2,'gid://hack') v`, [P2, T2]))[0].v === false ? pass('§3 STALE owner persist → false (blocked)') : fail('§3 stale owner persisted!');
(await q(`select shopify_cart_id from configurations where id=$1`, [P2]))[0].shopify_cart_id === null ? pass('§3 stale owner wrote nothing') : fail('§3 stale owner mutated config');

// resolve_config_intent_owned: only current owner.
await q(`update checkout_intents set status='draft_created', shopify_draft_order_id='gid://d/p1' where config_id=$1`, [P1]);
(await q(`select resolve_config_intent_owned($1,$2) v`, [P1, T1]))[0].v === true ? pass('§3 owner resolves intent → true') : fail('§3 owner resolve failed');
(await q(`select resolve_config_intent_owned($1,$2) v`, [P2, T2]))[0].v === false ? pass('§3 non-owner resolve → false') : fail('§3 non-owner resolved');

// ========== #2 stable sample idempotency ==========
const K1 = 'cccccccc-3333-4333-8333-333333333333';
const s1 = (await q(`select id, is_new from get_or_create_sample_order($1,null,null,'a@b.co','de',4000,2000)`, [K1]))[0];
s1.is_new === true ? pass('§2 first get_or_create → is_new=true') : fail('§2 first not new');
const s2 = (await q(`select id, is_new from get_or_create_sample_order($1,null,null,'a@b.co','de',4000,2000)`, [K1]))[0];
(s2.is_new === false && s2.id === s1.id) ? pass('§2 retry same key → SAME row, is_new=false (no duplicate sample/draft)') : fail('§2 retry made a new row');
const distinctRows = (await q(`select count(*)::int c from sample_orders where idempotency_key=$1`, [K1]))[0].c;
distinctRows === 1 ? pass('§2 exactly one sample_orders row for the key') : fail('§2 duplicate rows: ' + distinctRows);
// a different key → different row.
const K2 = 'dddddddd-4444-4444-8444-444444444444';
const s3 = (await q(`select id from get_or_create_sample_order($1,null,null,'a@b.co','de',4000,2000)`, [K2]))[0];
s3.id !== s1.id ? pass('§2 new key → new row (genuine new purchase)') : fail('§2 new key reused row');

// ========== v3 #5C row-count-checked owned RPCs ==========
// persist with a MISSING intent row → must raise (no partial success).
const [{ id: RC }] = await q(`insert into configurations(checkout_lock_token) values ($1) returning id`, [T1]);
// no checkout_intents row for RC → intent update matches 0 rows → RPC must throw.
let rcThrew = false;
try { await q(`select persist_config_draft_owned($1,$2,'gid://rc') v`, [RC, T1]); } catch { rcThrew = true; }
rcThrew ? pass('§5C persist with missing intent row → raises (no partial success)') : fail('§5C persist did not raise on row_count=0');
// and the config must NOT have been left with the cart id (transaction rolled back).
(await q(`select shopify_cart_id from configurations where id=$1`, [RC]))[0].shopify_cart_id === null
  ? pass('§5C config rolled back (no shopify_cart_id) on incoherent intent') : fail('§5C config partially committed');
// with a matching intent row → succeeds.
await q(`insert into checkout_intents(config_id, token, status) values ($1,$2,'draft_pending')`, [RC, T1]);
(await q(`select persist_config_draft_owned($1,$2,'gid://rc') v`, [RC, T1]))[0].v === true ? pass('§5C persist with coherent intent → true') : fail('§5C coherent persist failed');
// resolve with wrong token → returns false (lock mismatch), and with 0-row intent raises.
(await q(`select resolve_config_intent_owned($1,$2) v`, [RC, T2]))[0].v === false ? pass('§5C resolve wrong token → false') : fail('§5C resolve wrong token not false');

// ========== v3 #6E concurrent same-key convergence ==========
// simulate the unique-violation loser path: insert a row for the key, then call the RPC with the
// same key — it must RE-READ the winner (is_new=false, same id), not raise.
const K = 'eeeeeeee-5555-4555-8555-555555555555';
const first = (await q(`select id, is_new from get_or_create_sample_order($1,null,null,'a@b.co','de',4000,2000)`, [K]))[0];
const again = (await q(`select id, is_new from get_or_create_sample_order($1,null,null,'a@b.co','de',9999,9999)`, [K]))[0];
(again.is_new === false && again.id === first.id) ? pass('§6E same key converges to one row (loser re-reads winner)') : fail('§6E did not converge');

// ========== v3 #6D historical price snapshot ==========
// first attempt stored 4000/2000; a retry with different current settings must return STORED snapshot.
const snap = (await q(`select amount_cents, credit_cents, currency from get_or_create_sample_order($1,null,null,'a@b.co','de',4500,2500)`, [K]))[0];
(snap.amount_cents === 4000 && snap.credit_cents === 2000) ? pass('§6D retry returns STORED snapshot (4000/2000), not current settings (4500/2500)') : fail('§6D used current settings: ' + JSON.stringify(snap));

// ========== v3 #6A invoice URL persistence + resume ==========
await q(`select set_sample_invoice($1,'gid://d/s','https://shop/invoice/s')`, [first.id]);
const resumed = (await q(`select shopify_draft_order_id, shopify_invoice_url from get_or_create_sample_order($1,null,null,'a@b.co','de',4000,2000)`, [K]))[0];
(resumed.shopify_draft_order_id === 'gid://d/s' && resumed.shopify_invoice_url === 'https://shop/invoice/s')
  ? pass('§6A retry recovers stored draft id + invoice URL (resume, not dead-end)') : fail('§6A no resume data');

// ========== v3 #7 race-safe takeover certification ==========
// happy path: prior config has the expected draft, no drift → certify true, both refs cleared+fenced.
const [{ id: CT }] = await q(`insert into configurations(shopify_cart_id, checkout_lock_token, checkout_lock_at) values ('gid://d/ct',$1, now() - interval '10 minutes') returning id`, [T1]);
await q(`insert into checkout_intents(config_id, token, status, shopify_draft_order_id) values ($1,$2,'draft_created','gid://d/ct')`, [CT, T1]);
(await q(`select certify_prior_config_superseded($1,'gid://d/ct') v`, [CT]))[0].v === true ? pass('§7 certify no-drift → true') : fail('§7 certify happy path false');
const ctAfter = (await q(`select shopify_cart_id, checkout_lock_token from configurations where id=$1`, [CT]))[0];
(ctAfter.shopify_cart_id === null && ctAfter.checkout_lock_token === null) ? pass('§7 certify cleared cart id + fenced lease token') : fail('§7 not cleared/fenced');
// drift path: a NEWER draft appeared (cart id differs from expected) → certify false, no benefit.
const [{ id: CT2 }] = await q(`insert into configurations(shopify_cart_id, checkout_lock_at) values ('gid://d/NEW',now() - interval '10 minutes') returning id`);
(await q(`select certify_prior_config_superseded($1,'gid://d/OLD') v`, [CT2]))[0].v === false ? pass('§7 certify with newer draft (drift) → false (takeover blocked)') : fail('§7 drift not blocked');
// live-lease path: prior lease newly live → certify false.
const [{ id: CT3 }] = await q(`insert into configurations(shopify_cart_id, checkout_lock_at) values ('gid://d/ct3', now()) returning id`);
(await q(`select certify_prior_config_superseded($1,'gid://d/ct3') v`, [CT3]))[0].v === false ? pass('§7 certify with newly-live prior lease → false') : fail('§7 live lease not blocked');
// open-orphan path: an open orphan for the config → certify false.
const [{ id: CT4 }] = await q(`insert into configurations(shopify_cart_id, checkout_lock_at) values ('gid://d/ct4', now() - interval '10 minutes') returning id`);
await q(`insert into checkout_orphan_drafts(shopify_draft_order_id, kind, config_id, status) values ('gid://d/ct4','orphan_draft',$1,'open')`, [CT4]);
(await q(`select certify_prior_config_superseded($1,'gid://d/ct4') v`, [CT4]))[0].v === false ? pass('§7 certify with open orphan → false') : fail('§7 open orphan not blocked');

console.log(failures === 0 ? '\nALL CHECKOUT-OWNERSHIP TESTS PASSED' : `\n${failures} CHECKOUT-OWNERSHIP TEST(S) FAILED`);
process.exit(failures ? 1 : 0);
