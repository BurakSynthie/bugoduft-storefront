// §checkout-locale + §hide-internal — executable regression tests (no network, no server-only).
//
// Part A proves the Shopify invoice URL carries the active storefront locale (de/en/fr) as
// ?locale=… so the hosted checkout opens in the same language the customer was browsing, WITHOUT
// touching the DraftOrderInput (pricing/currency/market/country unchanged; see
// draft-order-germany.test.ts).
//
// Part B is a STATIC source assertion (reads the file text — it does NOT import the server-only
// attribution module) proving every internal attribution property key emitted for Shopify is
// underscore-prefixed (hidden from customer checkout) and that no un-prefixed technical key leaks.
// Values are still emitted, so GA4 / Meta CAPI / Purchase attribution keep working; the
// server-purchase readers accept the new '_BUGO …' keys with a legacy 'BUGO …' fallback.
//
// Run with:  tsx lib/shopify/checkout-locale.test.ts
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { withCheckoutLocale } from './draft-order-input';

let failures = 0;
function expect(label: string, got: unknown, want: unknown) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) failures++;
  // eslint-disable-next-line no-console
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}: got ${JSON.stringify(got)} want ${JSON.stringify(want)}`);
}

// ============================ Part A — locale-aware checkout URL ============================
const BASE = 'https://bugoduft.myshopify.com/12345/invoices/abc?key=deadbeef';

expect('de → ?locale=de appended', withCheckoutLocale(BASE, 'de'), BASE + '&locale=de');
expect('en → ?locale=en appended (English stays English)', withCheckoutLocale(BASE, 'en'), BASE + '&locale=en');
expect('fr → ?locale=fr appended', withCheckoutLocale(BASE, 'fr'), BASE + '&locale=fr');
expect('no existing query → uses ?',
  withCheckoutLocale('https://shop.example/invoices/1', 'en'),
  'https://shop.example/invoices/1?locale=en');
expect('existing explicit locale is NOT overridden',
  withCheckoutLocale(BASE + '&locale=fr', 'de'), BASE + '&locale=fr');
expect('no locale → URL unchanged', withCheckoutLocale(BASE, null), BASE);
expect('empty locale → URL unchanged', withCheckoutLocale(BASE, ''), BASE);
expect('empty URL → unchanged', withCheckoutLocale('', 'de'), '');
expect('garbage locale → URL unchanged (no fake German fallback)',
  withCheckoutLocale(BASE, 'not-a-locale'), BASE);
expect('EN normalises to en', withCheckoutLocale(BASE, 'EN'), BASE + '&locale=en');

// ============================ Part B — internal keys hidden (static) ============================
const root = join(__dirname, '..', '..');
const attribSrc = readFileSync(join(root, 'lib/analytics/server-attribution.ts'), 'utf8');
const checkoutSrc = readFileSync(join(root, 'app/actions/checkout.ts'), 'utf8');
const purchaseSrc = readFileSync(join(root, 'lib/analytics/server-purchase.ts'), 'utf8');
const ordersSrc = readFileSync(join(root, 'app/api/shopify/orders/route.ts'), 'utf8');

const technical = ['Analytics Consent', 'Marketing Consent', 'GA Client ID', 'Meta FBP', 'Meta FBC'];
for (const t of technical) {
  expect(`attribution emits _BUGO ${t} (private)`, attribSrc.includes(`key: '_BUGO ${t}'`), true);
  expect(`attribution does NOT emit un-prefixed BUGO ${t}`, attribSrc.includes(`key: 'BUGO ${t}'`), false);
  expect(`server-purchase reads _BUGO ${t} with legacy fallback`,
    purchaseSrc.includes(`'_BUGO ${t}', 'BUGO ${t}'`), true);
}
expect('checkout emits _BUGO Configuration ID (private)',
  checkoutSrc.includes(`key:'_BUGO Configuration ID'`), true);
expect('checkout does NOT emit un-prefixed BUGO Configuration ID as a key',
  checkoutSrc.includes(`key:'BUGO Configuration ID'`), false);
expect('orders webhook reads _BUGO Configuration ID with legacy fallback',
  ordersSrc.includes(`attr(order, '_BUGO Configuration ID') ?? attr(order, 'BUGO Configuration ID')`), true);

// ---------------------------------------------------------------------------------------------
// eslint-disable-next-line no-console
console.log(failures === 0 ? '\nALL CHECKOUT-LOCALE + HIDDEN-FIELD TESTS PASSED' : `\n${failures} TEST(S) FAILED`);
if (failures > 0) process.exit(1);
