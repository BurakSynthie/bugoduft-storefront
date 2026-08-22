// §OPTION-3-v4.1 EXECUTE-level regressions for the 0031 wiring fixes, against real Postgres (PGlite).
// Loads the ACTUAL 0028+0029+0030+0031 bodies. Covers the four SQL-observable V4.1 defects:
//   #1 fence-aware post-delete certification recognizes OUR fence token (does not reject it)
//   #2 revalidate_benefit_owned matches first_order_claims.customer_id = customers.id (NOT auth id)
//   #3 persist_config_checkout_owned writes canonical fields ONLY under the current lease token
//   #4 terminal-aware classifier + ONE owner-gated transition (no self-conflicting second clear)
// Run: node lib/checkout/checkout-v41-wiring.test.mjs
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
  -- §V4.2 #1 REAL production enum (0003): configurations.status is public.config_status, NOT text.
  do $$ begin create type config_status as enum ('draft','checkout_pending','ordered'); exception when duplicate_object then null; end $$;
  create table configurations(
    id uuid primary key default gen_random_uuid(), shopify_cart_id text,
    status config_status not null default 'draft',
    checkout_lock_token uuid, checkout_lock_at timestamptz,
    base_price_cents int, surcharge_cents int, total_price_cents int, unit_rate_cents int,
    pre_benefit_total_cents int, savings_cents int default 0,
    benefit_type text, benefit_amount_cents int default 0, sample_order_id uuid,
    free_sample_set boolean default false, free_sample_source text, auth_user_id uuid,
    front_path text, back_path text, supporting jsonb not null default '[]'::jsonb, checkout_snapshot jsonb);
  create table sample_orders(id uuid primary key default gen_random_uuid(), payment_state text default 'pending', shopify_draft_order_id text, shopify_invoice_url text, amount_cents int, credit_cents int, currency text default 'EUR', auth_user_id uuid, customer_id uuid, email text, locale locale, idempotency_key uuid, credit_reserved_config_id uuid, credit_reservation_expires_at timestamptz, credit_used_at timestamptz);
  create table checkout_intents(config_id uuid primary key, source text default 'main_checkout', sample_order_id uuid, token uuid, status text default 'draft_pending', shopify_draft_order_id text, benefit_type text, benefit_amount_cents int, expected_total_cents int, expected_currency text default 'EUR', created_at timestamptz default now(), updated_at timestamptz default now());
  create table checkout_orphan_drafts(id uuid primary key default gen_random_uuid(), shopify_draft_order_id text, kind text default 'orphan_draft', source text, config_id uuid, sample_order_id uuid, status text default 'open');
  create table customers(id uuid primary key default gen_random_uuid(), auth_user_id uuid);
  create table first_order_claims(customer_id uuid, config_id uuid, state text, expires_at timestamptz);
`);
for (const m of ['0028_checkout_ownership_and_benefit_risk','0029_checkout_state_machine_final','0030_checkout_state_machine_closure','0031_checkout_v4_wiring_fix','0032_checkout_canonical_persist_fix'])
  await db.exec(readFileSync('supabase/migrations/'+m+'.sql', 'utf8'));

const T1 = 'aaaaaaaa-1111-4111-8111-111111111111';
const T2 = 'bbbbbbbb-2222-4222-8222-222222222222';
const FENCE = 'ffffffff-9999-4999-8999-999999999999';

// ===================== #1 fence-aware certification recognizes OUR fence token =====================
// Simulate the real takeover path: fence an EXPIRED prior config (installs FENCE token), then certify
// with that same fence token. The old 0029 certify would abort on "newly live lease" (lock_at=now());
// the new certify_prior_config_fenced must accept OUR fence token and supersede both references.
const [{ id: P1 }] = await q(`insert into configurations(shopify_cart_id, checkout_lock_token, checkout_lock_at) values ('gid://d/p1',$1, now()-interval '10 minutes') returning id`, [T1]);
await q(`insert into checkout_intents(config_id, token, status, shopify_draft_order_id) values ($1,$2,'draft_created','gid://d/p1')`, [P1, T1]);
const fp1 = (await q(`select decision, draft_id from fence_prior_config_for_takeover($1,$2,120)`, [P1, FENCE]))[0];
(fp1.decision === 'fenced_delete' && fp1.draft_id === 'gid://d/p1') ? pass('§1 fence expired prior → fenced_delete with id') : fail('§1 fence: ' + JSON.stringify(fp1));
// certify WITH the fence token → must succeed (recognizes our own fence, not a competitor).
(await q(`select certify_prior_config_fenced($1,$2,'gid://d/p1') v`, [P1, FENCE]))[0].v === true ? pass('§1 certify recognizes OUR fence token → true (not rejected as live lease)') : fail('§1 certify rejected own fence');
const a1 = (await q(`select c.shopify_cart_id, c.checkout_lock_token, i.status from configurations c join checkout_intents i on i.config_id=c.id where c.id=$1`, [P1]))[0];
(a1.shopify_cart_id === null && a1.checkout_lock_token === null && a1.status === 'superseded') ? pass('§1 certify cleared cart + released fence + superseded intent') : fail('§1 post-certify state: ' + JSON.stringify(a1));
// A DIFFERENT (competitor) token where we expected our fence → must be rejected.
const [{ id: P2 }] = await q(`insert into configurations(shopify_cart_id, checkout_lock_token, checkout_lock_at) values ('gid://d/p2',$1, now()) returning id`, [T2]);
(await q(`select certify_prior_config_fenced($1,$2,'gid://d/p2') v`, [P2, FENCE]))[0].v === false ? pass('§1 certify with non-matching fence token → false (competitor reclaimed)') : fail('§1 certify accepted competitor token');
// fenced_safe path: expired prior, NO draft → fence returns fenced_safe; certify with empty expected id.
const [{ id: P3 }] = await q(`insert into configurations(checkout_lock_token, checkout_lock_at) values ($1, now()-interval '10 minutes') returning id`, [T1]);
const fp3 = (await q(`select decision, draft_id from fence_prior_config_for_takeover($1,$2,120)`, [P3, FENCE]))[0];
fp3.decision === 'fenced_safe' ? pass('§1 expired prior, no draft → fenced_safe') : fail('§1 fenced_safe: ' + JSON.stringify(fp3));
(await q(`select certify_prior_config_fenced($1,$2,'') v`, [P3, FENCE]))[0].v === true ? pass('§1 certify fenced_safe (empty expected id) → true') : fail('§1 fenced_safe certify failed');

// ===================== #2 revalidate matches customers.id, not auth.users.id =====================
// Deliberately make customers.id != auth_user_id (the exact regression the brief requires).
const AUTH = '99999999-aaaa-4aaa-8aaa-999999999999';
const [{ id: CUSTID }] = await q(`insert into customers(auth_user_id) values ($1) returning id`, [AUTH]);
(CUSTID !== AUTH) ? pass('§2 regression setup: customers.id != auth_user_id') : fail('§2 ids unexpectedly equal');
const [{ id: CFG2 }] = await q(`insert into configurations default values returning id`);
await q(`insert into first_order_claims(customer_id, config_id, state, expires_at) values ($1,$2,'reserved', now()-interval '1 hour')`, [CUSTID, CFG2]);
// Passing customers.id → matches the claim → true (and refreshes the window).
(await q(`select revalidate_benefit_owned('first_order_5pct',$1,$2,null,900) v`, [CFG2, CUSTID]))[0].v === true ? pass('§2 revalidate with customers.id → true (claim matched)') : fail('§2 customers.id did not match');
// Passing the AUTH id (the OLD bug) → matches NO claim → false (proves the old identifier was wrong).
(await q(`select revalidate_benefit_owned('first_order_5pct',$1,$2,null,900) v`, [CFG2, AUTH]))[0].v === false ? pass('§2 revalidate with auth_user_id → false (old bug would fail closed)') : fail('§2 auth id spuriously matched');

// ============== #3 (V4.2) owner-gated CANONICAL finalize persist against the REAL enum schema ==============
// Signature (0032): (config, token, status, base, surcharge, total, unit_rate, pre_benefit, savings,
//   benefit_type, benefit_amount, sample_order_id, free_sample_set, free_sample_source, auth_user_id,
//   front_path, back_path, supporting, snapshot).
const AUTH1 = '11111111-3333-4333-8333-111111111111';   // initial persisted auth identity
const AUTH2 = '22222222-4444-4444-8444-222222222222';   // FINAL authenticated checkout identity
// Seed the config as if beginCheckout persisted an INITIAL (pre-finalize) canonical state at an OLD
// catalog price, with an initial auth identity and an initial supporting artwork set.
const [{ id: C3 }] = await q(`insert into configurations(
    checkout_lock_token, status, base_price_cents, surcharge_cents, total_price_cents, unit_rate_cents,
    pre_benefit_total_cents, savings_cents, free_sample_set, free_sample_source, auth_user_id, supporting)
  values ($1,'draft',1000,100,1100,1000,1100,0,false,null,$2,'[{"field":"old","path":"old.png"}]'::jsonb) returning id`, [T1, AUTH1]);

// (A) REAL config_status enum path: a text status param must be safely CAST to public.config_status.
// (B) stale token → zero rows → false and NOTHING written.
const stale = (await q(`select persist_config_checkout_owned($1,$2,'checkout_pending',
    2000,200,2200,2000,2200,0,'first_order_5pct',110,null,true,'tier_bonus',$3,
    'front.png','back.png','[{"field":"add","path":"add.png"}]'::jsonb,'{"s":1}'::jsonb) v`, [C3, T2, AUTH2]))[0].v;
stale === false ? pass('§3B stale token canonical persist → false') : fail('§3B stale token wrote');
const c3s = (await q(`select base_price_cents, auth_user_id, supporting from configurations where id=$1`, [C3]))[0];
(c3s.base_price_cents===1000 && c3s.auth_user_id===AUTH1 && c3s.supporting?.[0]?.path==='old.png')
  ? pass('§3B stale token wrote NO canonical fields (pricing/identity/supporting intact)') : fail('§3B stale token mutated: ' + JSON.stringify(c3s));

// (A)+(C)+(D)+(E)+(F) owner token persists the COMPLETE FINAL canonical state at the NEW catalog price.
const owned = (await q(`select persist_config_checkout_owned($1,$2,'checkout_pending',
    2000,200,2200,2000,2200,150,'first_order_5pct',110,null,true,'tier_bonus',$3,
    'front.png','back.png','[{"field":"add","path":"add.png"},{"field":"add2","path":"add2.png"}]'::jsonb,'{"s":1}'::jsonb) v`, [C3, T1, AUTH2]))[0].v;
owned === true ? pass('§3A owner token persist against REAL config_status enum → true (text→enum cast works)') : fail('§3A owner persist failed on real enum');
const c3 = (await q(`select status, base_price_cents, surcharge_cents, total_price_cents, unit_rate_cents,
    pre_benefit_total_cents, savings_cents, benefit_type, benefit_amount_cents, free_sample_set,
    free_sample_source, auth_user_id, front_path, back_path, supporting, checkout_snapshot
  from configurations where id=$1`, [C3]))[0];
// (A) enum value actually stored.
(c3.status==='checkout_pending') ? pass('§3A status stored as real enum value checkout_pending') : fail('§3A status: ' + c3.status);
// (C) supporting artwork persisted (fulfilment-critical; admin order detail reads it).
(Array.isArray(c3.supporting) && c3.supporting.length===2 && c3.supporting[1]?.path==='add2.png')
  ? pass('§3C owner token persists supporting artwork JSON (not lost)') : fail('§3C supporting: ' + JSON.stringify(c3.supporting));
// (D) full authoritative pricing breakdown persisted.
(c3.base_price_cents===2000 && c3.surcharge_cents===200 && c3.total_price_cents===2200 && c3.unit_rate_cents===2000 &&
 c3.pre_benefit_total_cents===2200 && c3.savings_cents===150 && c3.benefit_type==='first_order_5pct' &&
 c3.benefit_amount_cents===110 && c3.free_sample_set===true && c3.free_sample_source==='tier_bonus' && c3.checkout_snapshot?.s===1)
  ? pass('§3D owner token persists FULL authoritative pricing breakdown + free-sample flags') : fail('§3D pricing: ' + JSON.stringify(c3));
// (E) changed authoritative pricing between initial persisted config and final checkout: ALL canonical
// price fields now match the FINAL checkout price (no stale pre-finalize 1000/100/1100 values remain).
(c3.base_price_cents!==1000 && c3.surcharge_cents!==100 && c3.total_price_cents!==1100 && c3.unit_rate_cents!==1000)
  ? pass('§3E changed catalog price → ALL canonical price fields match FINAL checkout (no stale pre-finalize price)') : fail('§3E stale price retained: ' + JSON.stringify(c3));
// (F) auth_user_id is the FINAL authenticated checkout identity, not the initial one.
(c3.auth_user_id===AUTH2 && c3.auth_user_id!==AUTH1) ? pass('§3F auth_user_id is the FINAL authenticated checkout identity') : fail('§3F auth id: ' + c3.auth_user_id);
// artwork omit-vs-clear + supporting omit: null path → unchanged; '' → clear; null supporting → unchanged.
(await q(`select persist_config_checkout_owned($1,$2,null,2000,200,2200,2000,2200,150,'first_order_5pct',110,null,true,'tier_bonus',$3,
    null,'',null,'{"s":2}'::jsonb) v`, [C3, T1, AUTH2]));
const c3b = (await q(`select front_path, back_path, supporting, status from configurations where id=$1`, [C3]))[0];
(c3b.front_path==='front.png' && c3b.back_path===null && Array.isArray(c3b.supporting) && c3b.supporting.length===2 && c3b.status==='checkout_pending')
  ? pass('§3 null path preserved, empty-string cleared, null supporting preserved, null status preserved') : fail('§3 sentinel: ' + JSON.stringify(c3b));

// ===================== #4 terminal-aware classifier + one owner-gated transition =====================
// Terminal intent draft id is NOT a live obligation.
const [{ id: M0 }] = await q(`insert into configurations default values returning id`);
await q(`insert into checkout_intents(config_id, token, status, shopify_draft_order_id) values ($1,$2,'superseded','gid://d/old')`, [M0, T1]);
const cm0 = (await q(`select draft_id, both_ref, intent_status from classify_main_draft_recovery($1)`, [M0]))[0];
(cm0.draft_id === null && cm0.both_ref === false) ? pass('§4 terminal intent → NOT a deletion obligation (draft_id null)') : fail('§4 terminal classify: ' + JSON.stringify(cm0));
// Non-terminal same-D → one obligation; ONE owner-gated transition clears+supersedes; retry sees no D.
const [{ id: M1 }] = await q(`insert into configurations(shopify_cart_id, checkout_lock_token) values ('gid://d/same',$1) returning id`, [T1]);
await q(`insert into checkout_intents(config_id, token, status, shopify_draft_order_id) values ($1,$2,'draft_created','gid://d/same')`, [M1, T1]);
const cm1 = (await q(`select draft_id, both_ref from classify_main_draft_recovery($1)`, [M1]))[0];
(cm1.draft_id === 'gid://d/same' && cm1.both_ref === true) ? pass('§4 config+intent SAME draft → one obligation (both_ref)') : fail('§4 classify: ' + JSON.stringify(cm1));
// stale token cannot transition.
(await q(`select supersede_main_draft_owned($1,$2,'gid://d/same') v`, [M1, T2]))[0].v === false ? pass('§4 stale token cannot transition → false') : fail('§4 stale transitioned');
// owner runs the SINGLE transition.
(await q(`select supersede_main_draft_owned($1,$2,'gid://d/same') v`, [M1, T1]))[0].v === true ? pass('§4 owner single transition → true') : fail('§4 owner transition failed');
const am1 = (await q(`select c.shopify_cart_id, i.status from configurations c join checkout_intents i on i.config_id=c.id where c.id=$1`, [M1]))[0];
(am1.shopify_cart_id === null && am1.status === 'superseded') ? pass('§4 ONE transition cleared cart + superseded intent (no second conflicting clear)') : fail('§4 transition state: ' + JSON.stringify(am1));
// retry after transition sees no D and does NOT re-delete; transition is idempotent → still true.
const cm1r = (await q(`select draft_id from classify_main_draft_recovery($1)`, [M1]))[0];
cm1r.draft_id === null ? pass('§4 retry after transition sees NO D (no second deletion obligation)') : fail('§4 retry still sees D: ' + JSON.stringify(cm1r));
(await q(`select supersede_main_draft_owned($1,$2,'gid://d/same') v`, [M1, T1]))[0].v === true ? pass('§4 transition idempotent on retry → true (no double-delete)') : fail('§4 idempotent retry failed');

console.log(failures === 0 ? '\nALL V4.1 WIRING TESTS PASSED' : `\n${failures} V4.1 WIRING TEST(S) FAILED`);
process.exit(failures ? 1 : 0);
