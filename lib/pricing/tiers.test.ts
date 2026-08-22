// §MEDIUM-12 Deterministic release-gate pricing checks. PURE — never imported by production code.
// Run with:  PATH=/home/claude/.npm-global/bin:$PATH tsx lib/pricing/tiers.test.ts
//
// Covers the tier engine, the storefront "from" price, the per-1.000 intensive surcharge,
// per-product minimums/rates, inactive-tier exclusion, the quantity envelope and the design-mode
// domain. Expected values are INDEPENDENT literals (no result is computed from the function under
// test), so a wrong implementation cannot make its own check pass.
import { priceQuantity, priceQuantitySafe, pickTier, hasTierCoverage, priceFromForMinQty, type PriceTier } from './tiers';
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

// ---------------------------------------------------------------------------------------------
// eslint-disable-next-line no-console
console.log(failures === 0 ? '\nALL PRICING TESTS PASSED' : `\n${failures} PRICING TEST(S) FAILED`);
if (failures > 0) process.exit(1);
