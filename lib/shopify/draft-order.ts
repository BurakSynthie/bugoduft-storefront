import 'server-only';
import { adminGraphql, isAdminConfigured } from '@/config/shopify-admin';

// ============================================================================
// P0 (final hardening §P0-1 / §P0-2): charge the EXACT BUGO authoritative total.
// ----------------------------------------------------------------------------
// PRICE (§P0-1). The previous implementation sent BOTH `variantId` AND
// `originalUnitPrice` on the main-product line. Shopify's DraftOrderLineItemInput
// IGNORES `originalUnitPrice` whenever `variantId` is present — so a €1.345 order was
// silently invoiced at the variant's €269 catalog price. Fix: build a genuine CUSTOM
// line item (title + originalUnitPrice, NO variantId). A custom line is the supported
// Admin-API way to charge a server-computed amount, and BUGO's configured-order model
// (one production order = one line, quantity-tiered price) is a natural custom line.
// Collection/inventory context that used to ride on the variant is preserved as order
// tags + line custom attributes instead — no information is lost, and nothing about the
// price is faked: `originalUnitPrice` is the freshly recomputed authoritative total.
//
// TAX / SHIPPING (§P0-2). BUGO's promise is one all-inclusive price: the customer must
// never be charged more than the authoritative total. We therefore make the draft order
// neutral to Shopify's own tax/shipping math:
//   • taxExempt: true            -> Shopify adds no tax on top of our amount
//   • line taxable: false        -> the line itself contributes no tax
//   • explicit shippingLine 0,00 -> a fixed custom shipping line, no calculated rates
// Any real VAT/shipping BUGO must remit is already priced INTO the authoritative total;
// this only stops Shopify from ADDING a second, unexpected amount at checkout.
//
// GUARANTEE. After creation we read back the draft's `totalPrice` and compare it, to the
// cent, against the BUGO total we asked for. If they differ we DELETE the draft and
// return an honest error instead of ever sending the customer to a wrong-amount invoice.
//
// Manual Shopify-side prerequisite (cannot be set from this repo):
//   The installed Admin API app must hold the `write_draft_orders` scope. Without it,
//   draftOrderCreate returns a permission error and checkout fails honestly below.
//   No "taxes-included" store setting is required — taxExempt makes the point moot.
// ============================================================================

export type DraftOrderAttr = { key: string; value: string };
export type DraftOrderResult =
  | { ok: true; invoiceUrl: string; draftOrderId: string; name: string }
  | { ok: false; reason: 'unconfigured' | 'missing_variant' | 'error'; message: string };

const DRAFT_ORDER_CREATE = `
mutation DraftOrderCreate($input: DraftOrderInput!) {
  draftOrderCreate(input: $input) {
    draftOrder {
      id name invoiceUrl
      totalPriceSet { presentmentMoney { amount currencyCode } }
    }
    userErrors { field message }
  }
}`;

const DRAFT_ORDER_DELETE = `
mutation DraftOrderDelete($input: DraftOrderDeleteInput!) {
  draftOrderDelete(input: $input) { deletedId userErrors { field message } }
}`;

type Money = { amount: string; currencyCode: string };
type DraftOrderCreateResponse = {
  draftOrderCreate: {
    draftOrder: {
      id: string; name: string; invoiceUrl: string | null;
      totalPriceSet: { presentmentMoney: Money } | null;
    } | null;
    userErrors: { field: string[] | null; message: string }[];
  };
};
type DraftOrderDeleteResponse = { draftOrderDelete: { deletedId: string | null; userErrors: { field: string[] | null; message: string }[] } };

// Parse a Shopify money string ("1345.00") to integer cents, defensively.
function moneyToCents(v: string | null | undefined): number | null {
  if (v == null) return null;
  const [w, f = ''] = String(v).trim().split('.');
  const whole = Number(w); if (!Number.isFinite(whole)) return null;
  return whole * 100 + Number((f + '00').slice(0, 2));
}

async function deleteDraftQuietly(id: string): Promise<void> {
  try { await adminGraphql<DraftOrderDeleteResponse>(DRAFT_ORDER_DELETE, { input: { id } }); }
  catch { /* best-effort cleanup; the honest error is already being returned */ }
}

// §P0 double-spend lifecycle: delete a previously-created draft for a checkout before
// replacing it, so a single configuration/benefit can never have two simultaneously
// payable Shopify invoices. Returns whether Shopify confirmed the deletion.
export async function deleteDraftOrder(id: string): Promise<boolean> {
  if (!isAdminConfigured() || !id) return false;
  try {
    const r = await adminGraphql<DraftOrderDeleteResponse>(DRAFT_ORDER_DELETE, { input: { id } });
    return Boolean(r.draftOrderDelete?.deletedId) && !(r.draftOrderDelete?.userErrors?.length);
  } catch { return false; }
}

export async function createBugoDraftOrder(args: {
  configId: string; collectionCode?: string; title: string; quantity: number;
  totalPriceCents: number; currency?: 'EUR'; note?: string; attributes: DraftOrderAttr[];
  customerEmail?: string | null;
}): Promise<DraftOrderResult> {
  if (!isAdminConfigured()) {
    return { ok: false, reason: 'unconfigured',
      message: 'Der Shopify-Draft-Order-Checkout ist noch nicht konfiguriert (Admin API fehlt).' };
  }
  // Total must be a strictly positive amount — never let a zero/negative total reach Shopify.
  if (!Number.isFinite(args.totalPriceCents) || args.totalPriceCents <= 0) {
    return { ok: false, reason: 'error', message: 'Ungültiger Gesamtbetrag.' };
  }
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
    tags: args.collectionCode ? ['bugo-configurator', args.collectionCode] : ['bugo-sample'],
    note: args.note ?? `BUGO Configuration ${args.configId}`,
    useCustomerDefaultAddress: false,
    taxExempt: true,                    // §P0-2: Shopify adds no tax on top of the BUGO total
    // §P0-2: fixed custom shipping at 0,00 so no calculated shipping is added at checkout.
    // Uses the current MoneyInput field (the scalar `price` is deprecated on 2026-07).
    shippingLine: { title: 'BUGO', priceWithCurrency: { amount: '0.00', currencyCode } },
  };
  if (args.customerEmail) input.email = args.customerEmail;

  try {
    const data = await adminGraphql<DraftOrderCreateResponse>(DRAFT_ORDER_CREATE, { input });
    const ue = data.draftOrderCreate.userErrors;
    const draft = data.draftOrderCreate.draftOrder;
    if (ue?.length || !draft || !draft.invoiceUrl) {
      return { ok: false, reason: 'error', message: ue?.[0]?.message ?? 'Draft order error' };
    }

    // §P0-2 GUARANTEE: the payable total must equal the BUGO authoritative total exactly,
    // AND be in EUR. We check the PRESENTMENT money (what the customer actually pays), not
    // just an amount in an unknown currency. If Shopify computed a different amount (a store
    // tax/shipping setting we don't control, a rounding surprise) OR a different presentment
    // currency, do NOT send the customer to pay — delete the draft and fail honestly.
    const pres = draft.totalPriceSet?.presentmentMoney;
    const shopifyCents = moneyToCents(pres?.amount);
    if (shopifyCents == null || shopifyCents !== args.totalPriceCents || pres?.currencyCode !== currencyCode) {
      await deleteDraftQuietly(draft.id);
      console.error('[shopify-admin] draft total/currency mismatch: expected',
        args.totalPriceCents, currencyCode, 'got', pres?.amount, pres?.currencyCode);
      return { ok: false, reason: 'error',
        message: 'Checkout-Konfigurationsfehler: Der Zahlbetrag oder die Währung stimmt nicht mit dem BUGO-Gesamtpreis überein.' };
    }

    return { ok: true, invoiceUrl: draft.invoiceUrl, draftOrderId: draft.id, name: draft.name };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg === 'admin_unconfigured') return { ok: false, reason: 'unconfigured', message: 'Shopify Admin API ist nicht konfiguriert.' };
    return { ok: false, reason: 'error', message: msg };
  }
}
