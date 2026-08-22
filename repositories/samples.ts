import 'server-only';
import type { Locale } from '@/i18n/config';
import { createSupabaseServiceClient } from '@/lib/supabase/server';
import { isSupabaseConfigured } from '@/lib/supabase/env';
import { isAdminConfigured } from '@/config/shopify-admin';
import { createBugoDraftOrder, deleteDraftOrder, type DraftOrderAttr } from '@/lib/shopify/draft-order';
import { recordOrphanDraft } from '@/repositories/reconciliation';
import { orphanCleanupOutcome, createCertaintyDecision, samplePurchaseGate } from '@/lib/checkout/guards';
import { getCustomerUser } from '@/lib/customer/session';
import { normalizeEmailOrNull } from '@/lib/customer/email';
import { getSettingsAuthoritative } from '@/repositories/settings';
import { beginCheckoutIntent, resolveCheckoutIntent, getOrCreateSampleOrder, setSampleInvoice,
  attachIntentDraftUrl, getIntentInvoiceUrl } from '@/repositories/configurations';
import { SAMPLE_PRICE_CENTS, SAMPLE_CREDIT_CENTS } from '@/lib/sample/constants';
import { getCheckoutAttribution, checkoutAttributionAttributes } from '@/lib/analytics/server-attribution';

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
  | { ok: false; code: 'unconfigured' | 'error'; message: string }
  // §OPTION-3-v4 #5 the idempotent subject reached a TERMINAL payment state (paid/cancelled). This is
  // NOT a resumable in-flight attempt — the client must ROTATE to a new attempt key for a deliberate
  // later purchase rather than resuming the old invoice. Not an error the customer needs to see.
  | { ok: false; code: 'rotate'; rotate: true; message: string };

export async function beginSampleCheckout(locale: Locale, checkoutAttemptId: string): Promise<SampleCheckoutResult> {
  if (!isSupabaseConfigured()) return { ok:false, code:'unconfigured', message:'Der Checkout ist noch nicht konfiguriert (Supabase fehlt).' };
  if (!isAdminConfigured()) return { ok:false, code:'unconfigured', message:'Der Shopify-Checkout ist noch nicht konfiguriert (Admin API).' };
  const svc = createSupabaseServiceClient();
  if (!svc) return { ok:false, code:'unconfigured', message:'Supabase ist nicht konfiguriert.' };

  // §HIGH-3 AUTHORITATIVE settings for a PAYMENT action. Creating a payable sample Draft Order is
  // financial, so it must NOT fall back to default commercial values (samples enabled, €40 price,
  // €20 credit) when Supabase settings can't be read — an admin might have disabled samples or
  // changed the price. If the authoritative read fails, fail closed and do not create a checkout.
  const { loaded, settings } = await getSettingsAuthoritative();
  const { enabled, priceCents, creditCents } = settings.commerce.paidSample;
  const gate = samplePurchaseGate({ loaded, enabled, priceCents });
  if (!gate.ok) {
    if (gate.reason === 'settings_unavailable') return { ok:false, code:'error', message:'Der Musterset-Checkout ist derzeit nicht verfügbar. Bitte später erneut versuchen.' };
    if (gate.reason === 'disabled') return { ok:false, code:'unconfigured', message:'Das Duftmuster-Set ist derzeit nicht bestellbar.' };
    return { ok:false, code:'error', message:'Ungültiger Musterpreis.' };
  }

  // Authenticated customer, when signed in — never required (guest purchase allowed),
  // but recorded so a later sign-in can find the purchase and any resulting credit.
  const user = await getCustomerUser();
  let customerId: string | null = null;
  if (user) {
    const { data: cust } = await svc.from('customers').select('id').eq('auth_user_id', user.id).maybeSingle();
    customerId = cust?.id ?? null;
  }

  // §OPTION-3-v2 #2 STABLE IDEMPOTENCY SUBJECT. The sample order is keyed by the client's
  // checkoutAttemptId, so an HTTP retry / second tab of the SAME logical attempt maps to the SAME
  // sample_orders row (not a fresh one per call). A genuinely new purchase uses a new key.
  const subject = await getOrCreateSampleOrder(svc, {
    idempotencyKey: checkoutAttemptId, authUserId: user?.id ?? null, customerId,
    email: normalizeEmailOrNull(user?.email), locale, amountCents: priceCents, creditCents,
  });
  if (!subject) return { ok:false, code:'error', message:'Der Musterset-Checkout konnte nicht abgeschlossen werden. Bitte erneut versuchen.' };
  const sampleOrderId = subject.id;

  // §OPTION-3-v4 #5 TERMINAL sample attempt. If this idempotent subject already reached a terminal
  // payment state (paid or cancelled), it is NOT a resumable in-flight attempt: resuming subject.
  // invoiceUrl would send a customer who ALREADY PAID back to their old (now paid) invoice, and a
  // cancelled attempt is likewise done. Instead, tell the client to ROTATE to a fresh attempt key so
  // a deliberate LATER purchase starts a genuinely new sample order. Only pending/unpaid subjects
  // fall through to the resume/create logic below (those retries keep the SAME key). This gate runs
  // BEFORE the draft-resume branch so a paid subject with a stored invoice URL never resumes it.
  if (subject.paymentState === 'paid' || subject.paymentState === 'cancelled') {
    console.warn('[sample] idempotent subject terminal (', subject.paymentState, ') → client should rotate attempt key');
    return { ok:false, code:'rotate', rotate:true,
      message:'Diese Musterset-Bestellung ist bereits abgeschlossen. Bitte starten Sie einen neuen Kauf.' };
  }
  // §OPTION-3-v3 #6D PAYMENT logic uses the AUTHORITATIVE stored snapshot for this idempotent
  // subject — NOT current site settings. A new subject was just inserted with the current price, so
  // its stored snapshot equals current settings; a retry after an admin price change still uses the
  // ORIGINAL stored amount/credit/currency, so the Shopify draft matches what the webhook verifies.
  const effPriceCents = subject.amountCents;
  const effCreditCents = subject.creditCents;
  const effCurrency = subject.currency;

  // If this idempotent subject already has a persisted payable draft (a prior attempt of the SAME
  // key completed the Shopify create), RESUME the SAME checkout URL — never create a second draft,
  // and never dead-end the customer. If a draft exists but no URL was persisted, fail closed.
  if (subject.draftId) {
    if (subject.invoiceUrl) {
      console.warn('[sample] idempotent retry → resuming existing checkout:', subject.draftId);
      return { ok:true, checkoutUrl: subject.invoiceUrl };
    }
    // §OPTION-3-v4 #7 sample_orders URL missing (process died between attach and setSampleInvoice).
    // Recover from the INTENT's durable invoice_url; heal sample_orders so future retries are fast.
    const rec = await getIntentInvoiceUrl(svc, sampleOrderId);
    if (rec.invoiceUrl && rec.draftId) {
      await setSampleInvoice(svc, sampleOrderId, rec.draftId, rec.invoiceUrl);
      console.warn('[sample] recovered invoice URL from intent (attach/persist crash window)');
      return { ok:true, checkoutUrl: rec.invoiceUrl };
    }
    console.error('[sample] existing draft but no stored/recoverable invoice URL — failing closed');
    return { ok:false, code:'error', message:'Für diese Anfrage läuft bereits ein Checkout. Bitte einen Moment warten und erneut versuchen.' };
  }

  const attribution = await getCheckoutAttribution();

  const attributes: DraftOrderAttr[] = [
    { key:'BUGO Sample Order ID', value: sampleOrderId },
    ...checkoutAttributionAttributes(attribution),
    { key:'Produkt', value: 'Duftmuster-Set (40 Düfte)' },
    { key:'Gesamtpreis (BUGO)', value: `${(effPriceCents/100).toFixed(2)} €` },
  ];
  // §OPTION-3 DURABLE PRE-CREATE INTENT for the sample path (same crash-window protection as main).
  // The stable sample_orders.id is the subject key; the token is DERIVED from the idempotency key
  // so a retry of the SAME logical attempt owns the SAME intent (not a fresh random token). Written
  // BEFORE the Shopify create so a hard death before persistence leaves a durable marker.
  const sampleToken = checkoutAttemptId;                    // stable per logical attempt (a valid uuid)
  const sIntent = await beginCheckoutIntent({
    configId: sampleOrderId, token: sampleToken, source: 'sample_checkout',
    sampleOrderId, benefitType: null, benefitAmountCents: 0, expectedTotalCents: effPriceCents, expectedCurrency: effCurrency,
  });
  // §OPTION-3-v2 #2 handle EVERY intent state — never fall through to createBugoDraftOrder blindly.
  if (sIntent.ok && sIntent.state === 'existing_draft') {
    // A payable draft already exists for this idempotent subject → RESUME the stored URL if we have
    // it (same as the subject.draftId branch above); otherwise fail closed (never a second create).
    if (subject.invoiceUrl) {
      console.warn('[sample] existing draft on intent → resuming stored checkout URL');
      return { ok:true, checkoutUrl: subject.invoiceUrl };
    }
    // §OPTION-3-v4 #7 fall back to the intent's durable invoice_url (crash window between attach and
    // sample-URL persist); heal sample_orders for next time.
    const rec = await getIntentInvoiceUrl(svc, sampleOrderId);
    if (rec.invoiceUrl && rec.draftId) {
      await setSampleInvoice(svc, sampleOrderId, rec.draftId, rec.invoiceUrl);
      console.warn('[sample] existing draft on intent → recovered invoice URL from intent');
      return { ok:true, checkoutUrl: rec.invoiceUrl };
    }
    console.error('[sample] existing draft on intent but no stored/recoverable URL — failing closed:', sIntent.draftId);
    return { ok:false, code:'error', message:'Für diese Anfrage läuft bereits ein Checkout. Bitte einen Moment warten und erneut versuchen.' };
  }
  if (!sIntent.ok) {
    // unknown_pending → a payable draft may exist unseen (record orphan). not_owner → a concurrent
    // attempt of the SAME key owns it. error → DB failure. All fail closed; do NOT cancel the sample
    // order on not_owner (the current owner is using it).
    if (sIntent.state === 'unknown_pending') {
      await recordOrphanDraft({ draftOrderId: `unknown:${sampleOrderId}`, source:'sample_checkout', sampleOrderId,
        authUserId: user?.id ?? null, reason:'sample_intent_pending_no_draft_id_possible_orphan' });
      await svc.from('sample_orders').update({ payment_state: 'cancelled' }).eq('id', sampleOrderId);
    }
    console.error('[sample] durable intent not safe to proceed:', sIntent.state);
    return { ok:false, code:'error', message: sIntent.state === 'not_owner'
      ? 'Für diese Anfrage läuft bereits ein Checkout. Bitte einen Moment warten.'
      : 'Der Musterset-Checkout konnte nicht abgeschlossen werden. Bitte erneut versuchen.' };
  }

  const draft = await createBugoDraftOrder({
    configId: sampleOrderId, title: TITLE[locale], quantity: 1,
    totalPriceCents: effPriceCents, attributes, customerEmail: user?.email ?? null,
    note: `BUGO Duftmuster-Set — sample_orders.id=${sampleOrderId}`,
  });
  if (!draft.ok) {
    // §OPTION-3-v4 #4 CREATE-CERTAINTY decision (same policy as main). unknown_create_outcome →
    // a payable draft MAY exist unseen → keep the durable intent BLOCKING (do NOT cancel the sample
    // in a way that lets a retry mint a second draft) and record an orphan. known_draft_unresolved
    // → orphan + fail closed. definitely_no_draft / confirmed_deleted → safe to reset + cancel.
    const dec = createCertaintyDecision(draft.certainty);
    if (dec.keepIntentBlocking) {
      const orphanId = draft.cleanup?.orphanDraftId ?? (draft.certainty === 'unknown_create_outcome' ? `unknown:${sampleOrderId}` : null);
      if (orphanId) {
        await recordOrphanDraft({
          draftOrderId: orphanId, source:'sample_checkout', sampleOrderId, authUserId: user?.id ?? null,
          reason: draft.certainty === 'unknown_create_outcome' ? 'sample_create_unknown_outcome_possible_draft' : 'sample_amount_mismatch_cleanup',
        });
      }
      console.error('[sample] create failed, draft may exist (', draft.certainty, ') — intent blocking, no reset');
      return { ok:false, code:'error', message:'Der Musterset-Checkout konnte nicht abgeschlossen werden. Bitte erneut versuchen.' };
    }
    // definitely_no_draft / confirmed_deleted → no payable draft remains → reset intent + cancel.
    await resolveCheckoutIntent(sampleOrderId, sampleToken, 'superseded');
    await svc.from('sample_orders').update({ payment_state: 'cancelled' }).eq('id', sampleOrderId);
    return { ok:false, code: draft.reason === 'unconfigured' ? 'unconfigured' : 'error', message: draft.message };
  }

  // §OPTION-3-v4 #7 record the draft id AND invoice URL on the durable intent ATOMICALLY, right
  // after create. Now even if the process dies before setSampleInvoice below, a retry recovers the
  // URL from the intent (get_intent_invoice_url) instead of dead-ending.
  if (!(await attachIntentDraftUrl(svc, sampleOrderId, sampleToken, draft.draftOrderId, draft.invoiceUrl))) {
    const deleted = await deleteDraftOrder(draft.draftOrderId);
    if (!orphanCleanupOutcome(deleted).releaseBenefit) {
      await recordOrphanDraft({ draftOrderId: draft.draftOrderId, source:'sample_checkout', sampleOrderId,
        authUserId: user?.id ?? null, reason:'sample_intent_attach_delete_unconfirmed' });
    }
    await svc.from('sample_orders').update({ payment_state: 'cancelled' }).eq('id', sampleOrderId);
    console.error('[sample] intent attach failed — draft handled, failing closed');
    return { ok:false, code:'error', message:'Der Musterset-Checkout konnte nicht abgeschlossen werden. Bitte erneut versuchen.' };
  }

  // §HIGH-9 / §DEFECT-6A PERSIST + VERIFY. A payable sample Draft Order now exists; its id AND its
  // invoice URL MUST be stored so BUGO can trace/fulfil it AND so an idempotent retry can RESUME the
  // same checkout URL. If the persist fails, never return a payable checkout URL BUGO cannot trace —
  // delete the draft and VERIFY the deletion.
  const persistedInvoice = await setSampleInvoice(svc, sampleOrderId, draft.draftOrderId, draft.invoiceUrl);
  if (!persistedInvoice) {
    const deleted = await deleteDraftOrder(draft.draftOrderId);
    const outcome = orphanCleanupOutcome(deleted);
    if (outcome.releaseBenefit) {
      // Deletion CONFIRMED — no untraceable payable invoice remains. Mark the sample cancelled
      // (best-effort) and fail the checkout honestly.
      await svc.from('sample_orders').update({ payment_state: 'cancelled' }).eq('id', sampleOrderId);
      console.error('[sample] draft persist failed; draft deletion CONFIRMED');
      return { ok:false, code:'error', message:'Der Musterset-Checkout konnte nicht abgeschlossen werden. Bitte erneut versuchen.' };
    }
    // Deletion NOT confirmed → a payable invoice of UNKNOWN status exists. Record reconciliation
    // so the draft id stays traceable; fail closed.
    await recordOrphanDraft({
      draftOrderId: draft.draftOrderId, source:'sample_checkout', sampleOrderId,
      authUserId: user?.id ?? null, reason:'sample_persist_failed_delete_unconfirmed',
    });
    console.error('[sample] CRITICAL: draft persist failed AND deletion UNCONFIRMED — orphan recorded:', draft.draftOrderId);
    return { ok:false, code:'error', message:'Der Musterset-Checkout konnte nicht abgeschlossen werden. Bitte erneut versuchen.' };
  }
  await resolveCheckoutIntent(sampleOrderId, sampleToken, 'resolved');
  return { ok:true, checkoutUrl: draft.invoiceUrl };
}
