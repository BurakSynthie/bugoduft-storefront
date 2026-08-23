// ============================================================================
// PURE, SERVER-AGNOSTIC Shopify DraftOrderInput builder.
// ----------------------------------------------------------------------------
// This module contains ONLY the pure construction of the Shopify Admin API
// DraftOrderInput. It has NO side effects and imports NOTHING server-only,
// Next.js, Supabase, network, or auth — so it can be imported directly by a
// standalone tsx/Node test runner (see draft-order-germany.test.ts) without
// pulling in the `server-only` poison guard.
//
// The server-only orchestration (auth token, GraphQL dispatch, read-back
// amount/currency guard, cleanup/orphan handling) stays in ./draft-order.ts,
// which imports `buildBugoDraftOrderInput` from here and uses it verbatim. The
// generated DraftOrderInput is therefore behaviorally identical to v1.2.5.
// ============================================================================

export type DraftOrderAttr = { key: string; value: string };

export type CreateBugoDraftOrderArgs = {
  configId: string; collectionCode?: string; title: string; quantity: number;
  totalPriceCents: number; currency?: 'EUR'; note?: string; attributes: DraftOrderAttr[];
  customerEmail?: string | null;
  // §checkout-locale The active BUGO storefront locale (de/en/fr). Optional so existing callers /
  // tests are unaffected; when present it is appended to the Shopify invoice URL (see
  // withCheckoutLocale) so the Shopify-hosted checkout OPENS in the same language the customer was
  // browsing. It does NOT enter the DraftOrderInput — pricing, currency, market and country are
  // untouched; only the checkout UI language follows the storefront.
  locale?: string | null;
};

// §checkout-locale Shopify's hosted checkout honours a `locale` query parameter on the checkout
// URL (the invoice URL redirects to checkout carrying its query string). This PURE helper appends
// `?locale=<locale>` (or `&locale=` when the URL already has a query) to the draft-order invoice
// URL so the checkout renders in the storefront language. It is defensive: an empty/unknown locale
// or an unparseable URL is returned unchanged (never breaks the redirect). The language must also
// be published in Shopify Admin → Settings → Languages for the translation to take effect; if it
// is not, Shopify falls back to the store's default language (it does not error).
export function withCheckoutLocale(invoiceUrl: string, locale?: string | null): string {
  if (!invoiceUrl || !locale) return invoiceUrl;
  const lang = String(locale).trim().toLowerCase();
  if (!/^[a-z]{2}(-[a-z]{2})?$/.test(lang)) return invoiceUrl;   // only well-formed locale codes
  try {
    const u = new URL(invoiceUrl);
    if (u.searchParams.has('locale')) return invoiceUrl;         // never override an explicit locale
    u.searchParams.set('locale', lang);
    return u.toString();
  } catch {
    return invoiceUrl;   // non-absolute / unparseable → leave the URL exactly as Shopify returned it
  }
}

// §v1.2.5 GERMANY-FIRST CHECKOUT. BUGO DUFT.DE is a Germany-first storefront, so a freshly
// created Shopify invoice checkout must OPEN with Land/Region = Deutschland instead of
// inheriting the store's backup region (which was showing Türkiye). We make this deterministic
// from the BUGO application at Draft Order creation time rather than relying on Shopify store
// backup-region settings. Two 2026-07 DraftOrderInput signals seed Germany:
//   • shippingAddress.countryCode = DE  — the initial shipping country the checkout renders.
//     We send ONLY the countryCode (a partial MailingAddressInput): no street, city, ZIP,
//     name, email or phone is invented, so no fake customer data enters Shopify. The customer
//     can still change the country in checkout — this is NOT a Germany-only restriction.
//   • marketRegionCountryCode = DE     — selects the German market so pricing/region context
//     matches, where the store's markets support it.
// presentmentCurrencyCode stays EUR — unchanged. This helper is a PURE function of its args
// (no network) so the Germany signal is unit-testable; createBugoDraftOrder uses it verbatim.
export const CHECKOUT_DEFAULT_COUNTRY = 'DE' as const;

export function buildBugoDraftOrderInput(args: CreateBugoDraftOrderArgs): Record<string, unknown> {
  const currencyCode = (args.currency ?? 'EUR');
  const amount = (args.totalPriceCents / 100).toFixed(2);

  // Custom line item: NO variantId. On API 2026-07 the scalar `originalUnitPrice` is
  // deprecated in favour of `originalUnitPriceWithCurrency` (a MoneyInput). We set the
  // amount AND an explicit currency so the price is never reinterpreted in a different
  // presentment currency. No variant is attached, so no catalog price overrides it.
  const lineItem: Record<string, unknown> = {
    title: args.title,
    quantity: 1,                        // one configured BUGO production order = 1 line
    originalUnitPriceWithCurrency: { amount, currencyCode },
    requiresShipping: true,
    taxable: false,                     // tax handled at order level (taxExempt) — never added on top
    customAttributes: args.attributes.map(a => ({ key: a.key, value: a.value })),
  };

  const input: Record<string, unknown> = {
    lineItems: [lineItem],
    // Force EUR as the draft's presentment currency so read-back and the customer's
    // invoice are both in EUR — never a converted amount in another currency.
    presentmentCurrencyCode: currencyCode,
    // §v1.2.5 Seed Germany as the initial checkout country/market (see note above). Partial
    // address — countryCode ONLY, no invented street/city/ZIP/name/email/phone.
    shippingAddress: { countryCode: CHECKOUT_DEFAULT_COUNTRY },
    marketRegionCountryCode: CHECKOUT_DEFAULT_COUNTRY,
    tags: args.collectionCode ? ['bugo-configurator', args.collectionCode] : ['bugo-sample'],
    note: args.note ?? `BUGO Configuration ${args.configId}`,
    useCustomerDefaultAddress: false,
    taxExempt: true,                    // §P0-2: Shopify adds no tax on top of the BUGO total
    // §P0-2: fixed custom shipping at 0,00 so no calculated shipping is added at checkout.
    // Uses the current MoneyInput field (the scalar `price` is deprecated on 2026-07).
    shippingLine: { title: 'BUGO', priceWithCurrency: { amount: '0.00', currencyCode } },
  };
  if (args.customerEmail) input.email = args.customerEmail;
  return input;
}
