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
};

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
