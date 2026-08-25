// §MEDIUM-12 Deterministic release-gate pricing checks. PURE — never imported by production code.
// Run with:  PATH=/home/claude/.npm-global/bin:$PATH tsx lib/pricing/tiers.test.ts
//
// Covers the tier engine, the storefront "from" price, the per-1.000 intensive surcharge,
// per-product minimums/rates, inactive-tier exclusion, the quantity envelope and the design-mode
// domain. Expected values are INDEPENDENT literals (no result is computed from the function under
// test), so a wrong implementation cannot make its own check pass.
import { priceQuantity, priceQuantitySafe, pickTier, hasTierCoverage, priceFromForMinQty, storefrontFromCents, type PriceTier } from './tiers';
import { validateQuantity } from '../quantity';
import { isDesignMode, normalizeDesignMode } from '../configurator/design-mode';
import { validateTiers, validateQtyRules, validateTierCoverage } from './tier-input';

let failures = 0;
function expect(label: string, got: unknown, want: unknown) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) failures++;
  // eslint-disable-next-line no-console
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}: got ${JSON.stringify(got)} want ${JSON.stringify(want)}`);
}

// ---- Authoritative constants (independent; from the business spec) --------------------------
const R1000 = 26900;     // STANDARD €269,00 / 1.000
const R5000 = 24900;     // a representative bulk tier
const R100000 = 20900;   // STANDARD €20.900,00 total @100k => 20900/1.000
const INTENSE_A = 3000;  // product A intensive: €30 / 1.000
const INTENSE_B = 3500;  // product B intensive: €35 / 1.000

const STANDARD: PriceTier[] = [
  { minQty: 1000, ratePer1000Cents: R1000 },
  { minQty: 5000, ratePer1000Cents: R5000 },
  { minQty: 100000, ratePer1000Cents: R100000 },
];
// The per-1.000 surcharge rule (scales with quantity, NOT one-time).
const surcharge = (qty: number, rate: number) => Math.round(rate * (qty / 1000));

// ---- Tier totals (independent literals) -----------------------------------------------------
expect('1k normal total', priceQuantity(STANDARD, 1000).totalCents, 26900);          // €269,00
expect('5k normal total', priceQuantity(STANDARD, 5000).totalCents, 124500);         // 5×249,00
expect('100k normal total', priceQuantity(STANDARD, 100000).totalCents, 2090000);    // €20.900,00
expect('3k uses 1k tier', priceQuantity(STANDARD, 3000).totalCents, 80700);          // 3×269,00
expect('9k uses 5k tier', priceQuantity(STANDARD, 9000).totalCents, 224100);         // 9×249,00

// ---- Intensive surcharge = €30/€35 PER 1.000 (product A vs B) -------------------------------
expect('A 1k intensive total', priceQuantity(STANDARD, 1000).totalCents + surcharge(1000, INTENSE_A), 29900);   // €299,00
expect('A 5k intensive total', priceQuantity(STANDARD, 5000).totalCents + surcharge(5000, INTENSE_A), 139500);  // 124500 + 15000
expect('A 100k intensive total', priceQuantity(STANDARD, 100000).totalCents + surcharge(100000, INTENSE_A), 2390000); // 2090000 + 100×3000=300000
expect('B 1k intensive total', priceQuantity(STANDARD, 1000).totalCents + surcharge(1000, INTENSE_B), 30400);   // 26900 + 3500
expect('B 5k intensive total', priceQuantity(STANDARD, 5000).totalCents + surcharge(5000, INTENSE_B), 142000);  // 124500 + 17500
expect('surcharge is per-1.000 not one-time (5k>1×rate)', surcharge(5000, INTENSE_A), 15000);

// ---- Storefront "from" price = rate at product min_qty (ACTIVE tiers only) ------------------
expect('from @min 1000', priceFromForMinQty(STANDARD, 1000, 99999), 26900);
expect('from @min 5000 (product min)', priceFromForMinQty(STANDARD, 5000, 99999), 24900);
expect('from @min 4000 rounds to 1k tier', priceFromForMinQty(STANDARD, 4000, 99999), 26900);
expect('from fallback when no eligible tier', priceFromForMinQty([{ minQty: 5000, ratePer1000Cents: R5000 }], 1000, 27777), 27777);
// §HIGH-5 inactive tiers must be filtered by the CALLER before pricing — simulate active-only:
const withInactive: PriceTier[] = [
  { minQty: 1000, ratePer1000Cents: 26900 },
  { minQty: 5000, ratePer1000Cents: 19900 },   // pretend INACTIVE — must not be seen
];
const activeOnly = withInactive.filter((_, i) => i !== 1);
expect('inactive tier excluded from from-price', priceFromForMinQty(activeOnly, 5000, 99999), 26900);
expect('inactive tier excluded from total', priceQuantity(activeOnly, 5000).totalCents, 134500); // 5×269,00 not 5×199,00

// ---- Quantity envelope / per-product rules --------------------------------------------------
expect('1000 valid', validateQuantity(1000, { min: 1000, max: 100000, step: 1000 }), null);
expect('999 below_min', validateQuantity(999, { min: 1000, max: 100000, step: 1000 }), 'below_min');
expect('100001 above_max', validateQuantity(100001, { min: 1000, max: 100000, step: 1000 }), 'above_max');
expect('1500 bad_step', validateQuantity(1500, { min: 1000, max: 100000, step: 1000 }), 'bad_step');
expect('per-product min 5000 rejects 4000', validateQuantity(4000, { min: 5000, max: 100000, step: 1000 }), 'below_min');
expect('per-product min 5000 accepts 5000', validateQuantity(5000, { min: 5000, max: 100000, step: 1000 }), null);

// ---- validateQtyRules (admin envelope) ------------------------------------------------------
expect('qtyRules ok', validateQtyRules({ minQty: 1000, maxQty: 100000, qtyStep: 1000 }).ok, true);
expect('qtyRules rejects 500 step', validateQtyRules({ minQty: 1000, maxQty: 100000, qtyStep: 500 }).ok, false);
expect('qtyRules rejects min>max', validateQtyRules({ minQty: 50000, maxQty: 2000, qtyStep: 1000 }).ok, false);
expect('qtyRules rejects >100000', validateQtyRules({ minQty: 1000, maxQty: 200000, qtyStep: 1000 }).ok, false);

// ---- validateTiers (dedupe + envelope) ------------------------------------------------------
const dup = validateTiers([{ minQty: 1000, ratePer1000Cents: 26900 }, { minQty: 1000, ratePer1000Cents: 24900 }]);
expect('duplicate tiers rejected', dup.ok, false);
const okTiers = validateTiers([{ minQty: 5000, ratePer1000Cents: 24900 }, { minQty: 1000, ratePer1000Cents: 26900 }]);
expect('valid tiers accepted', okTiers.ok, true);
expect('valid tiers sorted asc', okTiers.ok === true ? okTiers.tiers.map(t => t.minQty) : null, [1000, 5000]);
expect('tier off-grid rejected', validateTiers([{ minQty: 1500, ratePer1000Cents: 26900 }]).ok, false);

// ---- Design mode domain ---------------------------------------------------------------------
expect('bugo_creates is valid', isDesignMode('bugo_creates'), true);
expect('ready_file is valid', isDesignMode('ready_file'), true);
expect('garbage design mode invalid', isDesignMode('freehand'), false);
expect('normalize default', normalizeDesignMode(undefined), 'bugo_creates');
expect('normalize keeps ready_file', normalizeDesignMode('ready_file'), 'ready_file');
expect('normalize coerces garbage', normalizeDesignMode('xxx'), 'bugo_creates');

// =============================================================================================
// §P0/HIGH-12 — NO FUTURE-TIER FALLBACK. The dangerous behaviour: product min 1.000, only a 5.000
// bulk tier active → the old pickTier returned the 5.000 tier and priced 1.000 at the bulk rate.
// =============================================================================================
const ONLY_5K: PriceTier[] = [{ minQty: 5000, ratePer1000Cents: 24900 }];
expect('16a pickTier(1000) with only a 5000 tier is null (no fallback)', pickTier(ONLY_5K, 1000), null);
expect('16b priceQuantitySafe(1000) with only a 5000 tier is null', priceQuantitySafe(ONLY_5K, 1000), null);
let threw = false; try { priceQuantity(ONLY_5K, 1000); } catch { threw = true; }
expect('16c priceQuantity(1000) THROWS when no covering tier (fail closed)', threw, true);
expect('16d pickTier(5000) with only a 5000 tier selects it', pickTier(ONLY_5K, 5000)?.ratePer1000Cents, 24900);
expect('16e covered qty prices normally (5000)', priceQuantitySafe(ONLY_5K, 5000)?.totalCents, 124500);
expect('16f hasTierCoverage 1000 with only 5000 tier is false', hasTierCoverage(ONLY_5K, 1000), false);
expect('16g hasTierCoverage 5000 with only 5000 tier is true', hasTierCoverage(ONLY_5K, 5000), true);

// §HIGH-12 highest-tier-<=Q selection across multiple tiers (carry-forward pricing, not per-qty).
const MULTI: PriceTier[] = [{ minQty: 1000, ratePer1000Cents: 26900 }, { minQty: 5000, ratePer1000Cents: 24900 }, { minQty: 20000, ratePer1000Cents: 22900 }];
expect('16h 3000 uses 1000 tier', pickTier(MULTI, 3000)?.ratePer1000Cents, 26900);
expect('16i 5000 uses 5000 tier', pickTier(MULTI, 5000)?.ratePer1000Cents, 24900);
expect('16j 25000 uses 20000 tier', pickTier(MULTI, 25000)?.ratePer1000Cents, 22900);

// §17 INACTIVE min tier does not count for coverage — an active tier must cover min_qty.
// (validateTiers marks is_active; validateTierCoverage requires an ACTIVE covering tier.)
const tiersInactiveMin = validateTiers([
  { minQty: 1000, ratePer1000Cents: 26900, isActive: false },   // covers min but INACTIVE
  { minQty: 5000, ratePer1000Cents: 24900, isActive: true },
]);
expect('17a validateTiers ok', tiersInactiveMin.ok, true);
expect('17b inactive 1000 tier does NOT cover min 1000',
  tiersInactiveMin.ok === true ? validateTierCoverage(tiersInactiveMin.tiers, 1000).ok : null, false);

// §18 MIN TIER COVERAGE required at admin save.
const cov5000only = validateTiers([{ minQty: 5000, ratePer1000Cents: 24900, isActive: true }]);
expect('18a product min 1000, first active tier 5000 → REJECTED',
  cov5000only.ok === true ? validateTierCoverage(cov5000only.tiers, 1000).ok : null, false);
const cov1000 = validateTiers([{ minQty: 1000, ratePer1000Cents: 26900, isActive: true }, { minQty: 5000, ratePer1000Cents: 24900, isActive: true }]);
expect('18b active 1000 tier covering min 1000 → ACCEPTED',
  cov1000.ok === true ? validateTierCoverage(cov1000.tiers, 1000).ok : null, true);
expect('18c active 1000 tier covers min 5000 too (highest ≤ Q)',
  cov1000.ok === true ? validateTierCoverage(cov1000.tiers, 5000).ok : null, true);

// §19 QUANTITY MODEL: min=5000 / step=2000 alignment is relative to the MINIMUM.
const R = { min: 5000, max: 99000, step: 2000 };     // (max-min)=94000 is a whole # of steps
expect('19a 5000 valid (the minimum itself)', validateQuantity(5000, R), null);
expect('19b 7000 valid', validateQuantity(7000, R), null);
expect('19c 6000 invalid (bad step from min)', validateQuantity(6000, R), 'bad_step');
expect('19d 9000 valid', validateQuantity(9000, R), null);
expect('19e 4000 below_min', validateQuantity(4000, R), 'below_min');
expect('19f 99000 valid (max boundary, aligned)', validateQuantity(99000, R), null);
expect('19g 100000 above_max', validateQuantity(100000, R), 'above_max');
// admin envelope coherence: (max-min) must be a whole number of steps.
expect('19h validateQtyRules min5000/max100000/step2000 REJECTED (100000 unreachable)',
  validateQtyRules({ minQty: 5000, maxQty: 100000, qtyStep: 2000 }).ok, false);
expect('19i validateQtyRules min5000/max99000/step2000 accepted',
  validateQtyRules({ minQty: 5000, maxQty: 99000, qtyStep: 2000 }).ok, true);
// legacy default rule still holds.
expect('19j default min1000/step1000: 2000 valid', validateQuantity(2000, { min: 1000, max: 100000, step: 1000 }), null);

// ---- §INTRO-250-500 — two fixed intro entry points (250 & 500) --------------------------------
// The four variants' intro tiers, exactly as seeded in migration 0037 / data/seed/products.ts.
// Each carries its intro rates PLUS the untouched 1.000 ladder entry, so we also assert the
// 1.000 series is unchanged and no intermediate quantity is opened.
const INTRO_R = { min: 1000, max: 100000, step: 1000, allowIntro: true };
// --- validation: 250/500 accepted only with allowIntro; 750/1.250/1.500 always rejected -------
expect('intro 250 valid (allowIntro)', validateQuantity(250, INTRO_R), null);
expect('intro 500 valid (allowIntro)', validateQuantity(500, INTRO_R), null);
expect('intro 250 REJECTED without allowIntro', validateQuantity(250, { min: 1000, max: 100000, step: 1000 }), 'below_min');
expect('intro 500 REJECTED without allowIntro', validateQuantity(500, { min: 1000, max: 100000, step: 1000 }), 'below_min');
expect('no intermediate 750 (even with allowIntro)', validateQuantity(750, INTRO_R), 'below_min');
expect('no intermediate 1250 (even with allowIntro)', validateQuantity(1250, INTRO_R), 'bad_step');
expect('no intermediate 1500 (even with allowIntro)', validateQuantity(1500, INTRO_R), 'bad_step');
expect('1000 still valid with allowIntro', validateQuantity(1000, INTRO_R), null);
expect('2000 still valid with allowIntro', validateQuantity(2000, INTRO_R), null);

// --- price to the exact cent for all four variants (rate × qty/1000) --------------------------
type IV = { std: number; prm: number; dlx: number; vip: number };
const T = (rate250: IV, rate500: IV, rate1000: IV) => ({
  STD: [{ minQty: 250, ratePer1000Cents: rate250.std }, { minQty: 500, ratePer1000Cents: rate500.std }, { minQty: 1000, ratePer1000Cents: rate1000.std }] as PriceTier[],
  PRM: [{ minQty: 250, ratePer1000Cents: rate250.prm }, { minQty: 500, ratePer1000Cents: rate500.prm }, { minQty: 1000, ratePer1000Cents: rate1000.prm }] as PriceTier[],
  DLX: [{ minQty: 250, ratePer1000Cents: rate250.dlx }, { minQty: 500, ratePer1000Cents: rate500.dlx }, { minQty: 1000, ratePer1000Cents: rate1000.dlx }] as PriceTier[],
  VIP: [{ minQty: 250, ratePer1000Cents: rate250.vip }, { minQty: 500, ratePer1000Cents: rate500.vip }, { minQty: 1000, ratePer1000Cents: rate1000.vip }] as PriceTier[],
});
const V = T(
  { std: 71600, prm: 75600, dlx: 79600, vip: 83600 },  // 250 rates
  { std: 39800, prm: 41800, dlx: 43800, vip: 45800 },  // 500 rates
  { std: 26900, prm: 27900, dlx: 28900, vip: 32000 },  // 1.000 rates (unchanged)
);
// 250 → 179 / 189 / 199 / 209 €
expect('STD 250 = 179,00 €', priceQuantitySafe(V.STD, 250)?.totalCents, 17900);
expect('PRM 250 = 189,00 €', priceQuantitySafe(V.PRM, 250)?.totalCents, 18900);
expect('DLX 250 = 199,00 €', priceQuantitySafe(V.DLX, 250)?.totalCents, 19900);
expect('VIP 250 = 209,00 €', priceQuantitySafe(V.VIP, 250)?.totalCents, 20900);
// 500 → 199 / 209 / 219 / 229 €
expect('STD 500 = 199,00 €', priceQuantitySafe(V.STD, 500)?.totalCents, 19900);
expect('PRM 500 = 209,00 €', priceQuantitySafe(V.PRM, 500)?.totalCents, 20900);
expect('DLX 500 = 219,00 €', priceQuantitySafe(V.DLX, 500)?.totalCents, 21900);
expect('VIP 500 = 229,00 €', priceQuantitySafe(V.VIP, 500)?.totalCents, 22900);
// intro totals are whole cents (no rounding drift): round(rate*0.25) and round(rate*0.5) are exact
expect('STD 250 exact (no rounding remainder)', 71600 % 4, 0);
expect('STD 500 exact (no rounding remainder)', 39800 % 2, 0);
// 1.000 series is UNCHANGED even with intro tiers present
expect('STD 1000 still 269,00 € with intro tiers', priceQuantitySafe(V.STD, 1000)?.totalCents, 26900);
expect('STD 2000 still 538,00 € with intro tiers', priceQuantitySafe(V.STD, 2000)?.totalCents, 53800);
// intro tiers must NOT become the "list" reference for a 1.000 order (no bogus strike-through)
expect('STD 1000 baseTotal = 269,00 € (intro not base)', priceQuantitySafe(V.STD, 1000)?.baseTotalCents, 26900);
expect('STD 1000 savings = 0 (intro not base)', priceQuantitySafe(V.STD, 1000)?.savingsCents, 0);
// pickTier lands on the right intro tier (never a lower one for 500)
expect('pickTier(250) → 250 tier', pickTier(V.STD, 250)?.minQty, 250);
expect('pickTier(500) → 500 tier', pickTier(V.STD, 500)?.minQty, 500);
// storefront "ab" price for a min-1.000 product is still the 1.000 rate, not an intro rate
expect('from @min 1000 with intro tiers = 26900 (not intro)', priceFromForMinQty(V.STD, 1000, 99999), 26900);

// Display-only storefront from-price = the smallest purchasable tier's TOTAL, not its per-1.000 rate.
const STANDARD_WITH_INTRO: PriceTier[] = V.STD;
expect('storefront from with intro tier = 17900 total', storefrontFromCents(STANDARD_WITH_INTRO, 1000, 99999), 17900);
expect('storefront from without intro tier = 26900 total @1000', storefrontFromCents(STANDARD, 1000, 99999), 26900);

// ---------------------------------------------------------------------------------------------
// eslint-disable-next-line no-console
console.log(failures === 0 ? '\nALL PRICING TESTS PASSED' : `\n${failures} PRICING TEST(S) FAILED`);
if (failures > 0) process.exit(1);
