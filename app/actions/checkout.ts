'use server';
import type { IncomingConfig } from '@/repositories/configurations';
import { validateAndPrice, upsertConfiguration, reserveBenefitForCheckout, releaseHeldBenefit, getExistingDraftId } from '@/repositories/configurations';
import { createUploadTargets, storageBucket, type UploadTarget } from '@/lib/supabase/storage';
import { isSupabaseConfigured } from '@/lib/supabase/env';
import { isAdminConfigured } from '@/config/shopify-admin';
import { createBugoDraftOrder, deleteDraftOrder, type DraftOrderAttr } from '@/lib/shopify/draft-order';
import { formatQty } from '@/lib/money';

const ERR_PREP = 'Die Konfiguration konnte nicht für den Checkout vorbereitet werden. Bitte versuchen Sie es erneut.';

export type BeginResult =
  | { ok: true; configId: string; bucket: string; uploads: UploadTarget[] }
  | { ok: false; code: 'invalid'|'unconfigured'|'error'; message: string };

// Step 1: validate + price (server truth), persist draft, issue signed upload URLs.
export async function beginCheckout(
  cfg: IncomingConfig, fileFields: { field: string; name: string }[],
): Promise<BeginResult> {
  const priced = await validateAndPrice(cfg);
  if (!priced.ok) { console.error('[checkout] begin invalid:', priced.error); return { ok:false, code:'invalid', message: ERR_PREP }; }
  if (!isSupabaseConfigured()) return { ok:false, code:'unconfigured',
    message:'Der Checkout ist noch nicht konfiguriert (Supabase fehlt).' };
  const saved = await upsertConfiguration({ ...cfg, ...priced, status:'draft' });
  if (!saved.ok) { console.error('[checkout] begin upsert failed:', saved.message); return { ok:false, code:'error', message: ERR_PREP }; }
  try {
    const uploads = (await createUploadTargets(cfg.configId, fileFields)) ?? [];
    return { ok:true, configId: cfg.configId, bucket: storageBucket, uploads };
  } catch (e:any) { console.error('[checkout] begin signed-url error:', e?.message ?? e); return { ok:false, code:'error', message: ERR_PREP }; }
}

export type FinalizeResult =
  | { ok: true; checkoutUrl: string }
  | { ok: false; code: 'invalid'|'unconfigured'|'missing_variant'|'error'; message: string };

// Step 2: re-validate, record uploaded paths, create a Shopify Draft Order priced at the
// authoritative BUGO tier total, return the invoice URL to redirect the customer to.
//
// Why a draft order and not the Storefront cart: the Storefront Cart API can only charge
// a fixed catalog variant price. BUGO's total is quantity-tiered (€/1.000 × pieces, plus
// intensive-fragrance surcharge, minus any future sample-credit/first-order benefit) and
// essentially never equals a single fixed variant price. Draft orders support an explicit
// `originalUnitPrice` override, which is the Shopify-supported way to charge a custom,
// server-computed amount (see lib/shopify/draft-order.ts). This guarantees the customer is
// never sent to a checkout for the wrong amount — if the draft order can't be created, the
// checkout fails honestly instead of silently charging the wrong price.
export async function finalizeCheckout(
  cfg: IncomingConfig,
  paths: { frontPath?: string|null; backPath?: string|null; supporting?: { field:string; path:string }[] },
): Promise<FinalizeResult> {
  const priced = await validateAndPrice(cfg);                          // recompute — never trust client
  if (!priced.ok) { console.error('[checkout] finalize invalid:', priced.error); return { ok:false, code:'invalid', message: ERR_PREP }; }
  if (!isAdminConfigured()) return { ok:false, code:'unconfigured',
    message:'Der Shopify-Checkout ist noch nicht konfiguriert (Admin API).' };

  // §P0-3: atomically SECURE the benefit before charging. If a concurrent order already
  // holds it, `held` comes back empty and we transparently fall back to the full pre-benefit
  // price — never double-granting. The adjusted values below are what actually get persisted,
  // shown on the Shopify invoice, and verified against.
  const held = await reserveBenefitForCheckout(priced, cfg.configId);
  const finalTotalCents = Math.max(0, priced.preBenefitTotalCents - held.benefitAmountCents);
  const adjusted = {
    ...priced,
    benefitType: held.benefitType,
    benefitAmountCents: held.benefitAmountCents,
    sampleOrderId: held.sampleOrderId,
    totalPriceCents: finalTotalCents,
  };

  // §P0 DOUBLE-SPEND: one configuration must never have two simultaneously payable drafts.
  // Capture any prior draft for this config BEFORE the upsert (which clears shopify_cart_id),
  // then delete it once — so re-finalizing the same config replaces, never accumulates,
  // its Shopify invoice.
  const priorDraftId = await getExistingDraftId(cfg.configId);

  await upsertConfiguration({ ...cfg, ...adjusted, ...paths, status:'checkout_pending' });
  if (priorDraftId) await deleteDraftOrder(priorDraftId);

  const attributes: DraftOrderAttr[] = [
    { key:'BUGO Configuration ID', value: cfg.configId },
    { key:'Kollektion', value: cfg.collectionCode },
    { key:'Menge', value: `${formatQty(cfg.quantity, cfg.locale)}` },
    { key:'Duft', value: cfg.scentCode ?? '-' },
    ...(cfg.scentCode2 ? [{ key:'Duft 2 (kostenlos)', value: cfg.scentCode2 }] : []),
    { key:'Intensität', value: cfg.intensity === 'intense' ? 'Intensivduft' : 'Normalduft' },
    { key:'Form', value: cfg.shape },
    { key:'Vorderseite', value: paths.frontPath ? 'hochgeladen' : '-' },
    { key:'Rückseite', value: cfg.sameBackAsFront ? 'identisch' : (paths.backPath ? 'hochgeladen' : '-') },
    { key:'Designmodus', value: (cfg.designMode === 'ready_file' ? 'Fertige Druckdatei' : 'BUGO erstellt Design') },
    { key:'Stückpreis/1.000', value: `${(priced.unitRateCents/100).toFixed(2)} €` },
    { key:'Gesamtpreis vor Vorteil', value: `${(priced.preBenefitTotalCents/100).toFixed(2)} €` },
    { key:'Gesamtpreis (BUGO)', value: `${(finalTotalCents/100).toFixed(2)} €` },
    ...(priced.savingsCents > 0 ? [{ key:'Mengenersparnis', value: `${(priced.savingsCents/100).toFixed(2)} €` }] : []),
    ...(priced.freeSampleSet ? [{ key:'40-Düfte Musterset', value: 'kostenlos inklusive' }] : []),
    ...(held.benefitType ? [
      { key:'Vorteilstyp', value: held.benefitType === 'sample_credit' ? 'Muster-Guthaben' : 'Erstbestellungs-Vorteil' },
      { key:'Vorteilsbetrag', value: `${(held.benefitAmountCents/100).toFixed(2)} €` },
    ] : []),
  ];
  const draft = await createBugoDraftOrder({
    configId: cfg.configId, collectionCode: cfg.collectionCode,
    title: `BUGO ${cfg.collectionCode} — ${formatQty(cfg.quantity, cfg.locale)} Stück`,
    quantity: cfg.quantity, totalPriceCents: finalTotalCents, attributes,
  });
  if (!draft.ok) {
    // Roll the reservation back so a transient Shopify failure doesn't strand the credit.
    await releaseHeldBenefit(held, cfg.configId, priced.authUserId);
    console.error('[checkout] draftOrderCreate failed:', draft.reason, draft.message);
    return { ok:false, code: draft.reason, message: draft.message };
  }
  await upsertConfiguration({ ...cfg, ...adjusted, ...paths, status:'checkout_pending', shopifyCartId: draft.draftOrderId });
  return { ok:true, checkoutUrl: draft.invoiceUrl };
}
