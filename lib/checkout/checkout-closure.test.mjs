// §OPTION-3-v4 EXECUTE-level tests for the 0030 closure RPCs, against real Postgres (PGlite).
// Loads actual 0028+0029+0030 bodies. Run: node lib/checkout/checkout-closure.test.mjs
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
  do $$ begin create type locale as enum ('de','en','fr'); exception when duplicate_object then null; end $$;
  create table configurations(id uuid primary key default gen_random_uuid(), shopify_cart_id text, status text default 'draft', checkout_lock_token uuid, checkout_lock_at timestamptz);
  create table sample_orders(id uuid primary key default gen_random_uuid(), payment_state text default 'pending', shopify_draft_order_id text, shopify_invoice_url text, amount_cents int, credit_cents int, currency text default 'EUR', auth_user_id uuid, customer_id uuid, email text, locale locale, idempotency_key uuid, credit_reserved_config_id uuid, credit_reservation_expires_at timestamptz, credit_used_at timestamptz);
  create table checkout_intents(config_id uuid primary key, source text default 'main_checkout', sample_order_id uuid, token uuid, status text default 'draft_pending', shopify_draft_order_id text, benefit_type text, benefit_amount_cents int, expected_total_cents int, expected_currency text default 'EUR', created_at timestamptz default now(), updated_at timestamptz default now());
  create table checkout_orphan_drafts(id uuid primary key default gen_random_uuid(), shopify_draft_order_id text, kind text default 'orphan_draft', source text, config_id uuid, sample_order_id uuid, status text default 'open');
  create table first_order_claims(customer_id uuid, config_id uuid, state text, expires_at timestamptz);
`);
for (const m of ['0028_checkout_ownership_and_benefit_risk','0029_checkout_state_machine_final','0030_checkout_state_machine_closure'])
  await db.exec(readFileSync('supabase/migrations/'+m+'.sql', 'utf8'));

const T1 = 'aaaaaaaa-1111-4111-8111-111111111111';
const T2 = 'bbbbbbbb-2222-4222-8222-222222222222';
const FENCE = 'ffffffff-9999-4999-8999-999999999999';

// ===== #9 set_sample_invoice proves one row =====
const [{ id: SO }] = await q(`insert into sample_orders(payment_state) values ('pending') returning id`);
(await q(`select set_sample_invoice($1,'gid://d/s','https://u') v`, [SO]))[0].v === true ? pass('§9 set_sample_invoice existing row → true') : fail('§9 true path');
(await q(`select set_sample_invoice('00000000-0000-4000-8000-000000000000','gid://x','https://x') v`))[0].v === false ? pass('§9 set_sample_invoice missing row → false (fail closed)') : fail('§9 missing row not false');

// ===== #3A clear_config_draft_owned (token + expected id) =====
const [{ id: C1 }] = await q(`insert into configurations(shopify_cart_id, checkout_lock_token) values ('gid://d/1',$1) returning id`, [T1]);
(await q(`select clear_config_draft_owned($1,$2,'gid://d/1') v`, [C1, T2]))[0].v === false ? pass('§3A stale token cannot clear → false') : fail('§3A stale cleared');
(await q(`select shopify_cart_id from configurations where id=$1`, [C1]))[0].shopify_cart_id === 'gid://d/1' ? pass('§3A stale wrote nothing') : fail('§3A stale mutated');
(await q(`select clear_config_draft_owned($1,$2,'gid://d/WRONG') v`, [C1, T1]))[0].v === false ? pass('§3A owner wrong expected-id → false (cannot clear newer D2)') : fail('§3A wrong id cleared');
(await q(`select clear_config_draft_owned($1,$2,'gid://d/1') v`, [C1, T1]))[0].v === true ? pass('§3A owner + expected id → true') : fail('§3A owner clear failed');

// ===== #3B persist_config_snapshot_owned =====
const [{ id: C2 }] = await q(`insert into configurations(checkout_lock_token) values ($1) returning id`, [T1]);
(await q(`select persist_config_snapshot_owned($1,$2,'checkout_pending','{"a":1}'::jsonb) v`, [C2, T1]))[0].v === true ? pass('§3B owner snapshot → true') : fail('§3B owner failed');
(await q(`select persist_config_snapshot_owned($1,$2,'checkout_pending','{"a":2}'::jsonb) v`, [C2, T2]))[0].v === false ? pass('§3B stale snapshot → false') : fail('§3B stale wrote');

// ===== #2 revalidate_benefit_owned (both types) =====
const [{ id: CUST }] = ['x'].map(()=>({id:'11111111-2222-4333-8444-555555555555'}));
const [{ id: CF }] = await q(`insert into configurations default values returning id`);
await q(`insert into first_order_claims(customer_id, config_id, state, expires_at) values ($1,$2,'reserved', now()-interval '1 hour')`, [CUST, CF]);
(await q(`select revalidate_benefit_owned('first_order_5pct',$1,$2,null,900) v`, [CF, CUST]))[0].v === true ? pass('§2 first_order still owned by config → true (refreshed)') : fail('§2 first_order revalidate');
(await q(`select expires_at > now() e from first_order_claims where customer_id=$1`, [CUST]))[0].e ? pass('§2 first_order reservation window refreshed') : fail('§2 not refreshed');
// another config owns it → false for CF
const [{ id: CF2 }] = await q(`insert into configurations default values returning id`);
(await q(`select revalidate_benefit_owned('first_order_5pct',$1,$2,null,900) v`, [CF2, CUST]))[0].v === false ? pass('§2 first_order owned by OTHER config → false (no stale discount)') : fail('§2 other config revalidated');
// sample_credit
const [{ id: SC }] = await q(`insert into sample_orders(payment_state, credit_reserved_config_id) values ('paid',$1) returning id`, [CF]);
(await q(`select revalidate_benefit_owned('sample_credit',$1,null,$2,900) v`, [CF, SC]))[0].v === true ? pass('§2 sample_credit owned+paid+unused → true') : fail('§2 sample_credit revalidate');
(await q(`select revalidate_benefit_owned('sample_credit',$1,null,$2,900) v`, [CF2, SC]))[0].v === false ? pass('§2 sample_credit other config → false') : fail('§2 sample_credit other config true');
// no benefit → trivially true
(await q(`select revalidate_benefit_owned(null,$1,null,null,900) v`, [CF]))[0].v === true ? pass('§2 no benefit → true (nothing to protect)') : fail('§2 null benefit false');

// ===== #1 fence_prior_config_for_takeover =====
// live lease → blocked, no fence.
const [{ id: L1 }] = await q(`insert into configurations(shopify_cart_id, checkout_lock_token, checkout_lock_at) values ('gid://d/live',$1, now()) returning id`, [T1]);
const f1 = (await q(`select decision, draft_id from fence_prior_config_for_takeover($1,$2,120)`, [L1, FENCE]))[0];
f1.decision === 'blocked' ? pass('§1 live prior lease → blocked BEFORE any delete') : fail('§1 live not blocked: ' + f1.decision);
(await q(`select checkout_lock_token from configurations where id=$1`, [L1]))[0].checkout_lock_token === T1 ? pass('§1 live lease NOT fenced (token unchanged)') : fail('§1 live lease got fenced');
// expired lease with known draft → fenced_delete + token replaced.
const [{ id: L2 }] = await q(`insert into configurations(shopify_cart_id, checkout_lock_token, checkout_lock_at) values ('gid://d/old',$1, now()-interval '10 minutes') returning id`, [T1]);
const f2 = (await q(`select decision, draft_id from fence_prior_config_for_takeover($1,$2,120)`, [L2, FENCE]))[0];
(f2.decision === 'fenced_delete' && f2.draft_id === 'gid://d/old') ? pass('§1 expired lease + draft → fenced_delete with id') : fail('§1 expired: ' + JSON.stringify(f2));
(await q(`select checkout_lock_token from configurations where id=$1`, [L2]))[0].checkout_lock_token === FENCE ? pass('§1 old token replaced by fence token (old worker renew will fail)') : fail('§1 token not fenced');
// pending-no-id intent → blocked.
const [{ id: L3 }] = await q(`insert into configurations(checkout_lock_at) values (now()-interval '10 minutes') returning id`);
await q(`insert into checkout_intents(config_id, token, status) values ($1,$2,'draft_pending')`, [L3, T1]);
(await q(`select decision from fence_prior_config_for_takeover($1,$2,120)`, [L3, FENCE]))[0].decision === 'blocked' ? pass('§1 pending-no-id intent → blocked') : fail('§1 pending-no-id not blocked');

// ===== #5 classify + supersede one-draft coherence =====
const [{ id: M1 }] = await q(`insert into configurations(shopify_cart_id) values ('gid://d/same') returning id`);
await q(`insert into checkout_intents(config_id, token, status, shopify_draft_order_id) values ($1,$2,'draft_created','gid://d/same')`, [M1, T1]);
const cm = (await q(`select draft_id, both_ref from classify_main_draft_recovery($1)`, [M1]))[0];
(cm.draft_id === 'gid://d/same' && cm.both_ref === true) ? pass('§5 config+intent SAME draft → both_ref (one obligation)') : fail('§5 classify: ' + JSON.stringify(cm));
await q(`select supersede_main_draft_coherent($1,'gid://d/same')`, [M1]);
const after = (await q(`select c.shopify_cart_id, i.status from configurations c join checkout_intents i on i.config_id=c.id where c.id=$1`, [M1]))[0];
(after.shopify_cart_id === null && after.status === 'superseded') ? pass('§5 supersede cleared config + superseded intent (one transition)') : fail('§5 not coherent: ' + JSON.stringify(after));
// idempotent second call (already gone) does not error.
await q(`select supersede_main_draft_coherent($1,'gid://d/same')`, [M1]);
pass('§5 supersede idempotent second call (no double-delete obligation)');

// ===== #7 intent-carried invoice url recovery =====
const [{ id: S2 }] = await q(`insert into sample_orders(payment_state) values ('pending') returning id`);
await q(`insert into checkout_intents(config_id, token, status) values ($1,$2,'draft_pending')`, [S2, T1]);
(await q(`select attach_intent_draft_url($1,$2,'gid://d/s2','https://recover') v`, [S2, T1]))[0].v === true ? pass('§7 attach_intent_draft_url records id+url → true') : fail('§7 attach failed');
const rec = (await q(`select shopify_draft_order_id, invoice_url from get_intent_invoice_url($1)`, [S2]))[0];
(rec.shopify_draft_order_id === 'gid://d/s2' && rec.invoice_url === 'https://recover') ? pass('§7 get_intent_invoice_url recovers id+url (crash-window resume)') : fail('§7 recovery: ' + JSON.stringify(rec));
(await q(`select attach_intent_draft_url($1,$2,'gid://x','https://x') v`, [S2, T2]))[0].v === false ? pass('§7 attach wrong token → false') : fail('§7 wrong token attached');

console.log(failures === 0 ? '\nALL CHECKOUT-CLOSURE TESTS PASSED' : `\n${failures} CHECKOUT-CLOSURE TEST(S) FAILED`);
process.exit(failures ? 1 : 0);
