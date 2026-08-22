// EXECUTE-level verification of the corrected 0021/0022 SQL against a real Postgres (PGlite 16.4).
// Stubs the Supabase-only objects (roles, auth.users, storage, grants) and runs the ACTUAL
// function bodies extracted verbatim from the migration files, then proves the invariants.
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';

const fail = (m) => { console.log('FAIL ' + m); failures++; };
const pass = (m) => console.log('PASS ' + m);
let failures = 0;

function extractFns(sql, names) {
  // Grab each `create or replace function NAME(...) ... $$ ... $$;` block verbatim.
  const out = [];
  for (const name of names) {
    const re = new RegExp('create or replace function ' + name + '[\\s\\S]*?\\$\\$;', 'i');
    const m = sql.match(re);
    if (!m) throw new Error('could not extract ' + name);
    out.push(m[0]);
  }
  return out;
}

const m21 = readFileSync('supabase/migrations/0021_checkout_lease_and_envelope_checks.sql', 'utf8');
const m22 = readFileSync('supabase/migrations/0022_orphan_reconcile_and_atomic_product_save.sql', 'utf8');
const m23 = readFileSync('supabase/migrations/0023_benefit_revert_and_email_normalization.sql', 'utf8');
const [claimFn, releaseFn, renewFn] = extractFns(m21, ['claim_config_checkout', 'release_config_checkout', 'renew_config_checkout']);
const [adminSaveFn] = extractFns(m22, ['admin_save_product']);
const [revertSampleFn, revertFirstFn, releaseSampleOwnedFn, releaseFirstOwnedFn] = extractFns(m23,
  ['release_or_revert_sample_credit', 'release_or_revert_first_order', 'release_sample_credit_if_owner', 'release_first_order_if_owner']);

const db = await PGlite.create();

// ---- minimal stub schema (only what the extracted functions touch) ----
await db.exec(`
  create type locale as enum ('de','en','fr');
  create table configurations (
    id uuid primary key,
    checkout_lock_at timestamptz,
    checkout_lock_token uuid
  );
  create table products (
    id uuid primary key default gen_random_uuid(),
    product_code text unique not null,
    is_active boolean not null default true,
    sort_order int not null default 0,
    base_price_cents int not null default 0,
    min_qty int not null default 1000,
    max_qty int not null default 100000,
    qty_step int not null default 1000,
    compare_at_cents int,
    promo_enabled boolean not null default false,
    promo_start timestamptz, promo_end timestamptz,
    cover_media_id uuid, video_media_id uuid, poster_media_id uuid,
    constraint products_qty_envelope_chk check (
      min_qty >= 1000 and min_qty <= 100000 and min_qty % 1000 = 0
      and max_qty >= 1000 and max_qty <= 100000 and max_qty % 1000 = 0
      and qty_step >= 1000 and qty_step <= 100000 and qty_step % 1000 = 0
      and max_qty >= min_qty
      and (max_qty - min_qty) % qty_step = 0)
  );
  create table product_translations (
    id uuid primary key default gen_random_uuid(),
    product_id uuid not null references products(id) on delete cascade,
    locale locale not null,
    name text not null, slug text not null, h1 text, short_desc text, long_desc text,
    seo_title text, seo_description text,
    features text[] not null default '{}', use_case text, production_info text, delivery_info text,
    moq_text text, badge text, promo_badge text, og_image text,
    unique (product_id, locale)
  );
  create table product_price_tiers (
    id uuid primary key default gen_random_uuid(),
    product_id uuid not null references products(id) on delete cascade,
    min_qty int not null, unit_price_cents int not null,
    is_active boolean not null default true, sort_order int not null default 0,
    badge_de text, badge_en text, badge_fr text,
    unique (product_id, min_qty)
  );
  create table product_media (
    product_id uuid not null references products(id) on delete cascade,
    media_id uuid not null, role text not null default 'gallery', sort_order int not null default 0,
    primary key (product_id, media_id, role)
  );
  -- is_admin() reads a session GUC we flip in tests.
  create or replace function is_admin() returns boolean language sql stable as $$
    select coalesce(current_setting('test.is_admin', true), 'false') = 'true' $$;
  -- §HIGH-5 benefit tables (minimal columns the revert RPCs touch).
  create table sample_orders (
    id uuid primary key default gen_random_uuid(),
    email text,
    payment_state text not null default 'pending',
    credit_used_at timestamptz,
    credit_used_configuration_id uuid,
    credit_reserved_config_id uuid,
    credit_reservation_expires_at timestamptz
  );
  create table first_order_claims (
    customer_id uuid primary key,
    config_id uuid,
    state text not null default 'reserved'
  );
  -- §SMALL-6 email identity table for the eq-vs-ilike demonstration.
  create table customers (
    id uuid primary key default gen_random_uuid(),
    email text, auth_user_id uuid
  );
  -- §P0-2 orders table (minimal) for the paid→cancelled eligibility-transition test.
  create table orders (
    shopify_order_id text primary key,
    order_kind text not null default 'main',
    payment_state text,
    customer_id uuid
  );
`);

// Load the ACTUAL function bodies from the migrations.
await db.exec(claimFn);
await db.exec(releaseFn);
await db.exec(renewFn);
await db.exec(adminSaveFn);
await db.exec(revertSampleFn);
await db.exec(revertFirstFn);
await db.exec(releaseSampleOwnedFn);
await db.exec(releaseFirstOwnedFn);

const q = async (sql, params) => (await db.query(sql, params)).rows;

// =====================================================================
// §P0-5  OWNERSHIP-TOKEN LEASE
// =====================================================================
const CFG = '11111111-1111-1111-1111-111111111111';
await db.query('insert into configurations(id) values ($1)', [CFG]);

const tokA = (await q('select claim_config_checkout($1, 90) as t', [CFG]))[0].t;
if (tokA) pass('lease: A acquires a token'); else fail('lease: A should get a token');

const held = (await q('select claim_config_checkout($1, 90) as t', [CFG]))[0].t;
if (held === null) pass('lease: B refused while A holds a valid lease (null)'); else fail('lease: B should be refused, got ' + held);

// Expire A's lease (simulate A running longer than TTL) and let B reclaim.
await db.query(`update configurations set checkout_lock_at = now() - interval '10 minutes' where id = $1`, [CFG]);
const tokB = (await q('select claim_config_checkout($1, 90) as t', [CFG]))[0].t;
if (tokB && tokB !== tokA) pass('lease: B reclaims after expiry with a DIFFERENT token'); else fail('lease: B should reclaim with a new token');

// §P0-5 CORE: stale owner A tries to release using its OLD token — must NOT release B's lease.
await db.query('select release_config_checkout($1, $2)', [CFG, tokA]);
const afterStale = (await q('select checkout_lock_token from configurations where id=$1', [CFG]))[0].checkout_lock_token;
if (afterStale === tokB) pass('§P0-5 stale owner A CANNOT release B\'s lease (token mismatch is a no-op)');
else fail('§P0-5 VIOLATION: stale release affected the lease, token now ' + afterStale);

// Current owner B releases with the matching token → cleared.
await db.query('select release_config_checkout($1, $2)', [CFG, tokB]);
const afterB = (await q('select checkout_lock_token, checkout_lock_at from configurations where id=$1', [CFG]))[0];
if (afterB.checkout_lock_token === null && afterB.checkout_lock_at === null) pass('lease: current owner B releases successfully');
else fail('lease: B should have released, got ' + JSON.stringify(afterB));

// Claim on a non-existent configuration returns null (nothing to lease).
const ghost = (await q('select claim_config_checkout($1, 90) as t', ['22222222-2222-2222-2222-222222222222']))[0].t;
if (ghost === null) pass('lease: claim on unknown configuration → null'); else fail('lease: unknown config should be null');

// =====================================================================
// §P0-2  LEASE RENEW / OWNERSHIP REVALIDATION (TTL overlap prevention)
// =====================================================================
const RCFG = 'aaaaaaaa-0000-0000-0000-000000000001';
await db.query('insert into configurations(id) values ($1)', [RCFG]);
const rTokA = (await q('select claim_config_checkout($1, 120) as t', [RCFG]))[0].t;
// A renews while it still owns the lease → true, and the lease clock is extended.
const renewOwn = (await q('select renew_config_checkout($1, $2, 120) as r', [RCFG, rTokA]))[0].r;
if (renewOwn === true) pass('§P0-2 A renews its OWN valid lease → true'); else fail('§P0-2 A should renew, got ' + renewOwn);
// A's TTL elapses; B legitimately reclaims (new token).
await db.query(`update configurations set checkout_lock_at = now() - interval '10 minutes' where id = $1`, [RCFG]);
const rTokB = (await q('select claim_config_checkout($1, 120) as t', [RCFG]))[0].t;
if (rTokB && rTokB !== rTokA) pass('§P0-2 B reclaims after A\'s TTL expiry (new token)'); else fail('§P0-2 B should reclaim');
// §P0-2 CORE: A (stale) tries to renew/continue with its OLD token → false → A must abort, no 2nd draft.
const renewStale = (await q('select renew_config_checkout($1, $2, 120) as r', [RCFG, rTokA]))[0].r;
if (renewStale === false) pass('§P0-2 stale A renew FAILS after B reclaimed → A cannot continue/create a 2nd draft');
else fail('§P0-2 VIOLATION: stale A renew returned ' + renewStale);
// While B holds a fresh lease, A also cannot reclaim via claim.
const aReclaim = (await q('select claim_config_checkout($1, 120) as t', [RCFG]))[0].t;
if (aReclaim === null) pass('§P0-2 A cannot re-claim while B\'s renewed lease is valid'); else fail('§P0-2 A should be refused');
// renew on unknown config → false (fail closed).
const renewGhost = (await q('select renew_config_checkout($1, $2, 120) as r', ['bbbbbbbb-0000-0000-0000-000000000009', rTokB]))[0].r;
if (renewGhost === false) pass('§P0-2 renew on unknown configuration → false'); else fail('§P0-2 unknown renew should be false');

// =====================================================================
// §HIGH-10  ATOMIC ADMIN PRODUCT SAVE
// =====================================================================
const PID = (await q(`insert into products(product_code, min_qty, max_qty, qty_step) values ('BUGO-STD',1000,100000,1000) returning id`))[0].id;
await db.query(`insert into product_translations(product_id, locale, name, slug) values ($1,'de','alt','alt-slug')`, [PID]);
await db.query(`insert into product_price_tiers(product_id, min_qty, unit_price_cents) values ($1, 9000, 11111)`, [PID]); // stale tier to be replaced

const productJson = JSON.stringify({ is_active:true, sort_order:1, base_price_cents:26900, min_qty:1000, qty_step:1000, max_qty:100000, promo_enabled:false });
const trJson = JSON.stringify([
  { locale:'de', name:'Neu DE', slug:'neu-de', features:['a','b'] },
  { locale:'en', name:'Neu EN', slug:'neu-en' },
  { locale:'fr', name:'Neu FR', slug:'neu-fr' },
]);
const tiersJson = JSON.stringify([{ min_qty:1000, unit_price_cents:26900, is_active:true, sort_order:0 }, { min_qty:5000, unit_price_cents:24900, is_active:true, sort_order:1 }]);
const galleryJson = JSON.stringify(['33333333-3333-3333-3333-333333333333','44444444-4444-4444-4444-444444444444']);

// (a) non-admin → not_admin, NOTHING changes.
await db.query(`select set_config('test.is_admin','false', false)`);
let raised = null;
try { await db.query('select admin_save_product($1,$2::jsonb,$3::jsonb,$4::jsonb,$5::jsonb)', ['BUGO-STD', productJson, trJson, galleryJson, tiersJson]); }
catch (e) { raised = e.message; }
if (raised && /not_admin/.test(raised)) pass('admin_save_product: non-admin raises not_admin'); else fail('admin_save_product: should raise not_admin, got ' + raised);
const trStill = (await q('select name from product_translations where product_id=$1 and locale=$2', [PID,'de']))[0].name;
if (trStill === 'alt') pass('admin_save_product: non-admin attempt changed NOTHING (translation intact)'); else fail('non-admin leaked a write: ' + trStill);

// (b) admin, tier coverage violation (min 1000 but only a 5000 tier) → raises, rolls back.
await db.query(`select set_config('test.is_admin','true', false)`);
raised = null;
try { await db.query('select admin_save_product($1,$2::jsonb,$3::jsonb,$4::jsonb,$5::jsonb)',
  ['BUGO-STD', productJson, trJson, galleryJson, JSON.stringify([{min_qty:5000,unit_price_cents:24900,is_active:true}])]); }
catch (e) { raised = e.message; }
if (raised && /no_active_tier_covers_min_qty/.test(raised)) pass('admin_save_product: tier-coverage violation raises'); else fail('coverage should raise, got ' + raised);
const trAfterCov = (await q('select name from product_translations where product_id=$1 and locale=$2', [PID,'de']))[0].name;
if (trAfterCov === 'alt') pass('admin_save_product: coverage failure ROLLED BACK (translation still "alt")'); else fail('coverage failure did not roll back: ' + trAfterCov);

// (c) admin, valid → all-or-nothing commit of product + translations + gallery + tiers.
await db.query('select admin_save_product($1,$2::jsonb,$3::jsonb,$4::jsonb,$5::jsonb)', ['BUGO-STD', productJson, trJson, galleryJson, tiersJson]);
const de = (await q('select name, features from product_translations where product_id=$1 and locale=$2',[PID,'de']))[0];
const trCount = (await q('select count(*)::int c from product_translations where product_id=$1',[PID]))[0].c;
const tierRows = await q('select min_qty from product_price_tiers where product_id=$1 order by min_qty',[PID]);
const galCount = (await q(`select count(*)::int c from product_media where product_id=$1 and role='gallery'`,[PID]))[0].c;
if (de.name === 'Neu DE' && JSON.stringify(de.features) === JSON.stringify(['a','b'])) pass('admin_save_product: translation upserted (name + text[] features)'); else fail('translation wrong: ' + JSON.stringify(de));
if (trCount === 3) pass('admin_save_product: all 3 locales present'); else fail('locale count ' + trCount);
if (JSON.stringify(tierRows.map(r=>r.min_qty)) === JSON.stringify([1000,5000])) pass('admin_save_product: tiers replaced (stale 9000 gone, 1000+5000 in)'); else fail('tiers wrong: ' + JSON.stringify(tierRows));
if (galCount === 2) pass('admin_save_product: gallery replaced (2 rows)'); else fail('gallery count ' + galCount);

// (d) rollback on an in-transaction failure AFTER the core update (bad locale enum in translations).
raised = null;
const beforeName = (await q('select name from product_translations where product_id=$1 and locale=$2',[PID,'de']))[0].name;
try { await db.query('select admin_save_product($1,$2::jsonb,$3::jsonb,$4::jsonb,$5::jsonb)',
  ['BUGO-STD', JSON.stringify({...JSON.parse(productJson), sort_order:99}),
   JSON.stringify([{ locale:'de', name:'SHOULD_ROLLBACK', slug:'x' }, { locale:'zz', name:'bad', slug:'y' }]),
   galleryJson, tiersJson]); }
catch (e) { raised = e.message; }
const afterSort = (await q('select sort_order from products where id=$1',[PID]))[0].sort_order;
const afterName = (await q('select name from product_translations where product_id=$1 and locale=$2',[PID,'de']))[0].name;
if (raised) pass('admin_save_product: bad locale mid-save raises'); else fail('bad locale should raise');
if (afterSort === 1 && afterName === beforeName) pass('§HIGH-10 ATOMIC: failure after core update ROLLED BACK product + translations');
else fail('§HIGH-10 VIOLATION: partial commit (sort_order=' + afterSort + ', name=' + afterName + ')');

// =====================================================================
// §HIGH-4  QUANTITY INVARIANT ENFORCED IN THE ADMIN RPC / DB
// =====================================================================
await db.query(`select set_config('test.is_admin','true', false)`);
const okTiers1000 = JSON.stringify([{ min_qty:1000, unit_price_cents:26900, is_active:true }]);
const okTiers5000 = JSON.stringify([{ min_qty:5000, unit_price_cents:24900, is_active:true }]);
async function saveQty(code, min, max, step, tiers) {
  let err = null;
  try {
    await db.query('select admin_save_product($1,$2::jsonb,$3::jsonb,$4::jsonb,$5::jsonb)',
      [code, JSON.stringify({ is_active:true, base_price_cents:1000, min_qty:min, max_qty:max, qty_step:step }),
       JSON.stringify([{ locale:'de', name:'n', slug:code+'-de' },{ locale:'en', name:'n', slug:code+'-en' },{ locale:'fr', name:'n', slug:code+'-fr' }]),
       '[]', tiers]);
  } catch (e) { err = e.message; }
  return err;
}
await db.query(`insert into products(product_code, min_qty, max_qty, qty_step) values ('QP1',5000,99000,2000)`);
let e1 = await saveQty('QP1', 5000, 99000, 2000, okTiers5000);
if (e1 === null) pass('§HIGH-4 min5000/max99000/step2000 → ACCEPT'); else fail('§HIGH-4 should accept, got ' + e1);
await db.query(`insert into products(product_code, min_qty, max_qty, qty_step) values ('QP2',5000,99000,2000)`);
let e2 = await saveQty('QP2', 5000, 100000, 2000, okTiers5000);
if (e2 && /invalid_qty_rules/.test(e2)) pass('§HIGH-4 min5000/max100000/step2000 → REJECT (100000 unreachable)'); else fail('§HIGH-4 should reject 100000, got ' + e2);
await db.query(`insert into products(product_code, min_qty, max_qty, qty_step) values ('QP3',1000,100000,1000)`);
let e3 = await saveQty('QP3', 1000, 100000, 1000, okTiers1000);
if (e3 === null) pass('§HIGH-4 min1000/max100000/step1000 → ACCEPT'); else fail('§HIGH-4 should accept, got ' + e3);
await db.query(`insert into products(product_code, min_qty, max_qty, qty_step) values ('QP4',1000,100000,1000)`);
let e4 = await saveQty('QP4', 1000, 100000, 0, okTiers1000);
if (e4 && /invalid_qty_rules/.test(e4)) pass('§HIGH-4 step=0 → REJECT'); else fail('§HIGH-4 should reject step 0, got ' + e4);
await db.query(`insert into products(product_code, min_qty, max_qty, qty_step) values ('QP5',1000,100000,1000)`);
let e5 = await saveQty('QP5', 50000, 2000, 1000, JSON.stringify([{ min_qty:1000, unit_price_cents:1, is_active:true }]));
if (e5 && /invalid_qty_rules/.test(e5)) pass('§HIGH-4 max<min → REJECT'); else fail('§HIGH-4 should reject max<min, got ' + e5);

// =====================================================================
// §HIGH-5  RELEASE-OR-REVERT BENEFITS (cancelled must not permanently consume)
// =====================================================================
const SO = 'cccccccc-0000-0000-0000-000000000001';
const CFG_A = 'dddddddd-0000-0000-0000-00000000000a';
const CFG_OTHER = 'dddddddd-0000-0000-0000-00000000000b';
// paid consumes the credit (config A).
await db.query(`insert into sample_orders(id,payment_state,credit_used_at,credit_used_configuration_id) values ($1,'paid', now(), $2)`, [SO, CFG_A]);
// cancel of config A reverts → credit available again (credit_used_at null).
await db.query('select release_or_revert_sample_credit($1,$2)', [SO, CFG_A]);
let used = (await q('select credit_used_at from sample_orders where id=$1',[SO]))[0].credit_used_at;
if (used === null) pass('§HIGH-5 cancel of paid-then-cancelled REVERTS the sample credit (available again)'); else fail('§HIGH-5 credit should be reverted, still used=' + used);
// idempotent second revert → still fine, no error, still available.
await db.query('select release_or_revert_sample_credit($1,$2)', [SO, CFG_A]);
pass('§HIGH-5 duplicate sample revert is idempotent (no error)');
// a DIFFERENT config cancel must NOT revert a credit consumed by config A.
await db.query(`update sample_orders set credit_used_at=now(), credit_used_configuration_id=$2 where id=$1`, [SO, CFG_A]);
await db.query('select release_or_revert_sample_credit($1,$2)', [SO, CFG_OTHER]);
used = (await q('select credit_used_at from sample_orders where id=$1',[SO]))[0].credit_used_at;
if (used !== null) pass('§HIGH-5 a different config\'s cancel does NOT free config A\'s consumed credit'); else fail('§HIGH-5 cross-config revert leaked');
// first-order: consume (claim consumed) then cancel-config reverts → claim deleted → eligible again.
const CUST = 'eeeeeeee-0000-0000-0000-000000000001';
await db.query(`insert into first_order_claims(customer_id, config_id, state) values ($1,$2,'consumed')`, [CUST, CFG_A]);
await db.query('select release_or_revert_first_order($1,$2)', [CUST, CFG_A]);
let claimN = (await q('select count(*)::int c from first_order_claims where customer_id=$1',[CUST]))[0].c;
if (claimN === 0) pass('§HIGH-5 cancel reverts a CONSUMED first-order claim (customer eligible again)'); else fail('§HIGH-5 claim should be deleted, count=' + claimN);
// a different config cancel must NOT delete a claim consumed by config A.
await db.query(`insert into first_order_claims(customer_id, config_id, state) values ($1,$2,'consumed')`, [CUST, CFG_A]);
await db.query('select release_or_revert_first_order($1,$2)', [CUST, CFG_OTHER]);
claimN = (await q('select count(*)::int c from first_order_claims where customer_id=$1',[CUST]))[0].c;
if (claimN === 1) pass('§HIGH-5 a different config\'s cancel does NOT delete config A\'s claim'); else fail('§HIGH-5 cross-config claim revert leaked');

// =====================================================================
// §SMALL-6  EXACT EMAIL MATCH vs ILIKE WILDCARD (identity linking safety)
// =====================================================================
await db.query(`insert into customers(email, auth_user_id) values ('a_b@x.com', gen_random_uuid())`);
await db.query(`insert into customers(email, auth_user_id) values ('axb@x.com', gen_random_uuid())`);
const ilikeN = (await q(`select count(*)::int c from customers where email ilike 'a_b@x.com'`))[0].c;
const eqN = (await q(`select count(*)::int c from customers where email = 'a_b@x.com'`))[0].c;
if (ilikeN === 2) pass('§SMALL-6 (demonstrates the bug) ILIKE \'a_b@x.com\' wrongly matches BOTH rows (_ is a wildcard)'); else fail('§SMALL-6 ilike expected 2, got ' + ilikeN);
if (eqN === 1) pass('§SMALL-6 (the fix) = \'a_b@x.com\' matches EXACTLY one row'); else fail('§SMALL-6 eq expected 1, got ' + eqN);

// =====================================================================
// §P0-1  OWNER-AWARE BENEFIT RELEASE (stale owner must not release current owner's reservation)
// =====================================================================
// Model: A reserves the sample credit for config C, A's lease expires, B reclaims C's lease,
// then STALE A tries to release the reservation — must be a NO-OP; the reservation stays for B.
const LC = 'ffffffff-0000-0000-0000-00000000000c';
await db.query('insert into configurations(id) values ($1)', [LC]);
const laTok = (await q('select claim_config_checkout($1,120) as t',[LC]))[0].t;          // A owns lease
const SO2 = 'cccccccc-0000-0000-0000-000000000002';
await db.query(`insert into sample_orders(id,payment_state,credit_reserved_config_id,credit_reservation_expires_at) values ($1,'paid',$2, now() + interval '30 minutes')`, [SO2, LC]);
// A's lease expires; B reclaims (new token).
await db.query(`update configurations set checkout_lock_at = now() - interval '10 minutes' where id=$1`,[LC]);
const lbTok = (await q('select claim_config_checkout($1,120) as t',[LC]))[0].t;           // B now owns lease
// STALE A tries to release using its OLD token → must NOT clear B's reservation.
await db.query('select release_sample_credit_if_owner($1,$2,$3)', [SO2, LC, laTok]);
let resv = (await q('select credit_reserved_config_id from sample_orders where id=$1',[SO2]))[0].credit_reserved_config_id;
if (resv === LC) pass('§P0-1 STALE A cannot release the reservation after B reclaimed the lease (no-op)');
else fail('§P0-1 VIOLATION: stale A released the current owner\'s reservation, resv=' + resv);
// Current owner B releases with the matching token → reservation cleared.
await db.query('select release_sample_credit_if_owner($1,$2,$3)', [SO2, LC, lbTok]);
resv = (await q('select credit_reserved_config_id from sample_orders where id=$1',[SO2]))[0].credit_reserved_config_id;
if (resv === null) pass('§P0-1 current owner B CAN release its own reservation (token matches)'); else fail('§P0-1 owner release failed, resv=' + resv);
// first-order: same ownership rule.
const LC2 = 'ffffffff-0000-0000-0000-00000000000d';
const CUST2 = 'eeeeeeee-0000-0000-0000-000000000002';
await db.query('insert into configurations(id) values ($1)', [LC2]);
const fa = (await q('select claim_config_checkout($1,120) as t',[LC2]))[0].t;
await db.query(`insert into first_order_claims(customer_id, config_id, state) values ($1,$2,'reserved')`, [CUST2, LC2]);
await db.query(`update configurations set checkout_lock_at = now() - interval '10 minutes' where id=$1`,[LC2]);
const fb = (await q('select claim_config_checkout($1,120) as t',[LC2]))[0].t;
await db.query('select release_first_order_if_owner($1,$2,$3)', [CUST2, LC2, fa]);   // stale A → no-op
let fc = (await q('select count(*)::int c from first_order_claims where customer_id=$1',[CUST2]))[0].c;
if (fc === 1) pass('§P0-1 STALE A cannot release B\'s first-order reservation (no-op)'); else fail('§P0-1 stale A released first-order claim');
await db.query('select release_first_order_if_owner($1,$2,$3)', [CUST2, LC2, fb]);   // owner B → releases
fc = (await q('select count(*)::int c from first_order_claims where customer_id=$1',[CUST2]))[0].c;
if (fc === 0) pass('§P0-1 current owner B releases its own first-order reservation'); else fail('§P0-1 owner first-order release failed');

// =====================================================================
// §P0-2  CANCELLED PAID ORDER MUST NOT COUNT AS A PREVIOUS PAID MAIN ORDER
// =====================================================================
// The exact eligibility signal: count(order_kind='main' AND payment_state='paid') for the customer.
const CUST3 = 'eeeeeeee-0000-0000-0000-000000000003';
const SOID = 'shopify-order-777';
const countPaidMain = async () => (await q(
  `select count(*)::int c from orders where customer_id=$1 and order_kind='main' and payment_state='paid'`, [CUST3]))[0].c;
// Webhook 1: paid → stored paid.
await db.query(`insert into orders(shopify_order_id, order_kind, payment_state, customer_id) values ($1,'main','paid',$2)
  on conflict (shopify_order_id) do update set payment_state=excluded.payment_state`, [SOID, CUST3]);
await db.query(`insert into first_order_claims(customer_id, config_id, state) values ($1,$2,'consumed')`, [CUST3, LC]);
let paidCount = await countPaidMain();
if (paidCount === 1) pass('§P0-2 Case A: paid main order counts as 1 previous paid order'); else fail('§P0-2 expected 1, got ' + paidCount);
// Webhook 2: cancelled → same shopify_order_id upserted with effectivePaymentState='cancelled'.
await db.query(`insert into orders(shopify_order_id, order_kind, payment_state, customer_id) values ($1,'main','cancelled',$2)
  on conflict (shopify_order_id) do update set payment_state=excluded.payment_state`, [SOID, CUST3]);
await db.query('select release_or_revert_first_order($1,$2)', [CUST3, LC]);   // revert the consumed claim
paidCount = await countPaidMain();
const consumedN = (await q(`select count(*)::int c from first_order_claims where customer_id=$1 and state='consumed'`,[CUST3]))[0].c;
if (paidCount === 0) pass('§P0-2 Case C: after cancellation the order no longer counts as a previous PAID order'); else fail('§P0-2 expected 0 after cancel, got ' + paidCount);
if (consumedN === 0) pass('§P0-2 Case C: consumed first-order claim reverted → customer eligible again'); else fail('§P0-2 claim not reverted, consumed=' + consumedN);
// Duplicate cancellation webhook → idempotent, stays cancelled.
await db.query(`insert into orders(shopify_order_id, order_kind, payment_state, customer_id) values ($1,'main','cancelled',$2)
  on conflict (shopify_order_id) do update set payment_state=excluded.payment_state`, [SOID, CUST3]);
paidCount = await countPaidMain();
if (paidCount === 0) pass('§P0-2 Case D: duplicate cancellation is idempotent (still 0 paid)'); else fail('§P0-2 duplicate cancel changed count to ' + paidCount);

console.log(failures === 0 ? '\nALL SQL-VERIFY CHECKS PASSED' : `\n${failures} SQL-VERIFY CHECK(S) FAILED`);
process.exit(failures ? 1 : 0);
