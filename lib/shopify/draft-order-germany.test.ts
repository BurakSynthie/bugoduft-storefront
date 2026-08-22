// §v1.2.5 — executable regression test for GERMANY-FIRST checkout seeding.
// PURE: exercises buildBugoDraftOrderInput (no network) to prove the DraftOrderInput that BOTH
// the normal configurator checkout and the Duftmuster/sample checkout send to Shopify carries the
// Germany country/market signal, keeps EUR presentment, and invents NO fake address/customer data.
//
// Run with:  tsx lib/shopify/draft-order-germany.test.ts
// Imports the PURE, server-agnostic builder — NOT ./draft-order (which is `server-only`). This
// lets the standalone tsx/Node runner exercise the exact DraftOrderInput logic without loading
// any server-only/Next.js/Supabase/network module.
import { buildBugoDraftOrderInput, CHECKOUT_DEFAULT_COUNTRY } from './draft-order-input';

let failures = 0;
function expect(label: string, got: unknown, want: unknown) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) failures++;
  // eslint-disable-next-line no-console
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}: got ${JSON.stringify(got)} want ${JSON.stringify(want)}`);
}

// A representative CONFIGURATOR order (has a collectionCode → tagged bugo-configurator).
const configInput = buildBugoDraftOrderInput({
  configId: 'cfg-1', collectionCode: 'AIR', title: 'BUGO Konfiguration', quantity: 1,
  totalPriceCents: 134500, attributes: [{ key: 'k', value: 'v' }],
});
// A representative DUFTMUSTER/SAMPLE order (no collectionCode → tagged bugo-sample).
const sampleInput = buildBugoDraftOrderInput({
  configId: 'sample-1', title: 'BUGO Duftmuster', quantity: 1,
  totalPriceCents: 4000, attributes: [],
});

// --- Germany is seeded on the SHIPPING ADDRESS (initial checkout country) for both flows -------
expect('config: shippingAddress.countryCode = DE',
  (configInput.shippingAddress as Record<string, unknown>).countryCode, 'DE');
expect('sample: shippingAddress.countryCode = DE',
  (sampleInput.shippingAddress as Record<string, unknown>).countryCode, 'DE');
expect('CHECKOUT_DEFAULT_COUNTRY constant is DE', CHECKOUT_DEFAULT_COUNTRY, 'DE');

// --- Germany is seeded on the MARKET so pricing/region context matches --------------------------
expect('config: marketRegionCountryCode = DE', configInput.marketRegionCountryCode, 'DE');
expect('sample: marketRegionCountryCode = DE', sampleInput.marketRegionCountryCode, 'DE');

// --- NO fake customer/address data: shippingAddress carries ONLY the countryCode ---------------
expect('config: shippingAddress has ONLY countryCode (no invented address fields)',
  Object.keys(configInput.shippingAddress as Record<string, unknown>).sort(), ['countryCode']);
expect('sample: shippingAddress has ONLY countryCode (no invented address fields)',
  Object.keys(sampleInput.shippingAddress as Record<string, unknown>).sort(), ['countryCode']);
// No name/phone/email etc. seeded anywhere from the country default (email only if caller passed one).
expect('config: no customer email invented', 'email' in configInput, false);

// --- EUR presentment is UNCHANGED (not touched by the Germany change) --------------------------
expect('config: presentmentCurrencyCode still EUR', configInput.presentmentCurrencyCode, 'EUR');
expect('sample: presentmentCurrencyCode still EUR', sampleInput.presentmentCurrencyCode, 'EUR');

// --- Country selection is NOT restricted to Germany (no allowed-countries / lock field) --------
expect('config: no country restriction field present',
  'allowedCountries' in configInput || 'countryCodeOfOrigin' in configInput, false);

// ---------------------------------------------------------------------------------------------
// eslint-disable-next-line no-console
console.log(failures === 0 ? '\nALL GERMANY-SEED TESTS PASSED' : `\n${failures} GERMANY-SEED TEST(S) FAILED`);
if (failures > 0) process.exit(1);
