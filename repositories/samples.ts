import 'server-only';
import type { Locale } from '@/i18n/config';
import { createSupabaseServiceClient } from '@/lib/supabase/server';
import { isSupabaseConfigured } from '@/lib/supabase/env';
import { isAdminConfigured } from '@/config/shopify-admin';
import { createBugoDraftOrder, type DraftOrderAttr } from '@/lib/shopify/draft-order';
import { getCustomerUser } from '@/lib/customer/session';
import { getSettings } from '@/repositories/settings';
import { SAMPLE_PRICE_CENTS, SAMPLE_CREDIT_CENTS } from '@/lib/sample/constants';

// Completion pass §1: the standalone, separately purchasable "Duftmuster-Set" (40
// fragrances, €40). Real commerce — no configurator, no 1,000+ main-product order
// required. Price is fixed and server-defined (never client input). Uses the SAME
// Draft Order architecture as the main checkout (lib/shopify/draft-order.ts); the
// resulting order is tagged `order_kind='sample'` by the webhook so it's always
// distinguishable from a main-product order.
// (SAMPLE_PRICE_CENTS/SAMPLE_CREDIT_CENTS live in lib/sample/constants.ts — a plain,
// non-'server-only' module — so client components can import the same numbers without
// pulling this 'server-only' file into the client bundle. Re-exported here too so
// existing server-side importers of this module keep working unchanged.)
export { SAMPLE_PRICE_CENTS, SAMPLE_CREDIT_CENTS };

const TITLE: Record<Locale, string> = {
  de: 'BUGO Duftmuster-Set — 40 Düfte',
  en: 'BUGO Fragrance Sample Set — 40 Scents',
  fr: 'Coffret d’échantillons BUGO — 40 Parfums',
};

export type SampleCheckoutResult =
  | { ok: true; checkoutUrl: string }
  | { ok: false; code: 'unconfigured' | 'error'; message: string };

export async function beginSampleCheckout(locale: Locale): Promise<SampleCheckoutResult> {
  if (!isSupabaseConfigured()) return { ok:false, code:'unconfigured', message:'Der Checkout ist noch nicht konfiguriert (Supabase fehlt).' };
  if (!isAdminConfigured()) return { ok:false, code:'unconfigured', message:'Der Shopify-Checkout ist noch nicht konfiguriert (Admin API).' };
  const svc = createSupabaseServiceClient();
  if (!svc) return { ok:false, code:'unconfigured', message:'Supabase ist nicht konfiguriert.' };

  // §P1: price/credit are admin-managed (Admin -> Ayarlar -> Ticari değerler), stored as
  // integer cents; the compile-time constants remain only as a safe fallback default.
  const settings = await getSettings();
  const { enabled, priceCents, creditCents } = settings.commerce.paidSample;
  if (!enabled) return { ok:false, code:'unconfigured', message:'Das Duftmuster-Set ist derzeit nicht bestellbar.' };
  if (!Number.isFinite(priceCents) || priceCents <= 0) return { ok:false, code:'error', message:'Ungültiger Musterpreis.' };

  // Authenticated customer, when signed in — never required (guest purchase allowed),
  // but recorded so a later sign-in can find the purchase and any resulting credit.
  const user = await getCustomerUser();
  let customerId: string | null = null;
  if (user) {
    const { data: cust } = await svc.from('customers').select('id').eq('auth_user_id', user.id).maybeSingle();
    customerId = cust?.id ?? null;
  }

  const ins = await svc.from('sample_orders').insert({
    auth_user_id: user?.id ?? null, customer_id: customerId, email: user?.email ?? null, locale,
    amount_cents: priceCents, credit_cents: creditCents, payment_state: 'pending',
  }).select('id').single();
  if (ins.error || !ins.data) return { ok:false, code:'error', message: ins.error?.message ?? 'sample_order_insert_failed' };
  const sampleOrderId = ins.data.id as string;

  const attributes: DraftOrderAttr[] = [
    { key:'BUGO Sample Order ID', value: sampleOrderId },
    { key:'Produkt', value: 'Duftmuster-Set (40 Düfte)' },
    { key:'Gesamtpreis (BUGO)', value: `${(priceCents/100).toFixed(2)} €` },
  ];
  const draft = await createBugoDraftOrder({
    configId: sampleOrderId, title: TITLE[locale], quantity: 1,
    totalPriceCents: priceCents, attributes, customerEmail: user?.email ?? null,
    note: `BUGO Duftmuster-Set — sample_orders.id=${sampleOrderId}`,
  });
  if (!draft.ok) return { ok:false, code: draft.reason === 'unconfigured' ? 'unconfigured' : 'error', message: draft.message };

  await svc.from('sample_orders').update({ shopify_draft_order_id: draft.draftOrderId }).eq('id', sampleOrderId);
  return { ok:true, checkoutUrl: draft.invoiceUrl };
}
