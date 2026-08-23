'use server';
import type { IncomingConfig } from '@/repositories/configurations';
import { validateAndPrice, upsertConfiguration, reserveBenefitForCheckout, releaseHeldBenefit, getExistingDraftId,
  acquireCheckoutLease, releaseCheckoutLease, renewCheckoutLease,
  beginCheckoutIntent, attachCheckoutIntentDraft, resolveCheckoutIntent,
  persistConfigDraftOwned, resolveConfigIntentOwned, supersedePriorConfigDraft,
  persistConfigCheckoutOwned, revalidateBenefitOwned,
  classifyMainDraftRecovery, supersedeMainDraftOwned } from '@/repositories/configurations';
import { createSupabaseServiceClient } from '@/lib/supabase/server';
import { createUploadTargets, storageBucket, type UploadTarget, type UploadFileField } from '@/lib/supabase/storage';
import { isPathUnderConfig } from '@/lib/checkout/artwork-validation';
import { isSupabaseConfigured } from '@/lib/supabase/env';
import { isAdminConfigured } from '@/config/shopify-admin';
import { createBugoDraftOrder, deleteDraftOrder, type DraftOrderAttr } from '@/lib/shopify/draft-order';
import { recordOrphanDraft } from '@/repositories/reconciliation';
import { orphanCleanupOutcome, createCertaintyDecision } from '@/lib/checkout/guards';
import { formatQty } from '@/lib/money';
import { getCheckoutAttribution, checkoutAttributionAttributes } from '@/lib/analytics/server-attribution';

const ERR_PREP = 'Die Konfiguration konnte nicht für den Checkout vorbereitet werden. Bitte versuchen Sie es erneut.';
const ERR_IN_PROGRESS = 'Für diese Konfiguration läuft bereits ein Checkout. Bitte einen Moment warten und erneut versuchen.';
const ERR_STALE_DRAFT = 'Eine vorherige Rechnung konnte nicht sicher aufgehoben werden. Bitte versuchen Sie es erneut.';

export type BeginResult =
  | { ok: true; configId: string; bucket: string; uploads: UploadTarget[] }
  | { ok: false; code: 'invalid'|'unconfigured'|'error'; message: string };

// Step 1: validate + price (server truth), persist draft, issue signed upload URLs.
export async function beginCheckout(
  cfg: IncomingConfig, fileFields: UploadFileField[],
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
  // §1 PATH OWNERSHIP: every client-supplied storage path must live under this exact
  // configuration's prefix (configurator/{configId}/{field}/…). A client must not be able to
  // attach an arbitrary path or another configuration's artwork. Reject before any Shopify work.
  const suppliedPaths: (string | null | undefined)[] = [
    paths.frontPath, paths.backPath, ...((paths.supporting ?? []).map(s => s?.path)),
  ];
  for (const p of suppliedPaths) {
    if (p == null) continue;                                            // absent path is fine
    if (!isPathUnderConfig(p, cfg.configId)) {
      console.error('[checkout] finalize rejected foreign artwork path for config', cfg.configId);
      return { ok:false, code:'invalid', message: ERR_PREP };
    }
  }
  // Supporting field labels must also be valid (front/back/supporting-N) so a crafted entry
  // can't smuggle an odd field into the persisted snapshot.
  for (const s of (paths.supporting ?? [])) {
    if (s && !isPathUnderConfig(s.path, cfg.configId)) {
      return { ok:false, code:'invalid', message: ERR_PREP };
    }
  }
  if (!isAdminConfigured()) return { ok:false, code:'unconfigured',
    message:'Der Shopify-Checkout ist noch nicht konfiguriert (Admin API).' };

  // §P0-1/§P0-5/§P0-6 IDEMPOTENCY: take an OWNERSHIP-TOKEN lease so two concurrent finalizes for
  // this configuration can never both produce a payable draft. A held lease → retry; a missing RPC
  // or any DB error → FAIL CLOSED (do not proceed without the concurrency guard). Only the token
  // we receive here can release the lease, so we never clobber a newer owner's lock.
  const lease = await acquireCheckoutLease(cfg.configId);
  if (!lease.ok) {
    return { ok:false, code:'error', message: lease.reason === 'in_progress' ? ERR_IN_PROGRESS : ERR_PREP };
  }
  try {
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

  // §P0-1 DOUBLE-SPEND / FAIL CLOSED: one configuration must never have two simultaneously
  // payable drafts. Capture any prior draft, and if it exists but its deletion is NOT confirmed
  // by Shopify, abort — do NOT clear its stored id and do NOT create a second payable draft.
  // §P0-2 FAIL CLOSED: if the prior-draft lookup ERRORS, we cannot prove there is no old payable
  // draft — never treat that as "no draft" and create a second one. Abort.
  // §OPTION-3-v4 #5 COMBINED one-draft recovery. config.shopify_cart_id and
  // checkout_intents.shopify_draft_order_id may reference the SAME external draft (e.g. a crash
  // after persist but before resolve). Classify the combined state so we delete/verify that ONE
  // external object exactly ONCE, then supersede BOTH BUGO references atomically — never a second
  // deletion obligation that could permanently block on an already-gone draft.
  const svcRec = createSupabaseServiceClient();
  const prior = await getExistingDraftId(cfg.configId);
  if (!prior.ok) {
    await releaseHeldBenefit(held, cfg.configId, priced.authUserId, lease.token);
    console.error('[checkout] existing-draft lookup failed — failing closed');
    return { ok:false, code:'error', message: ERR_PREP };
  }
  // §OPTION-3-v4 #4 the classifier is TERMINAL-AWARE: a resolved/superseded intent's recorded draft
  // is NOT a live obligation (it was already confirmed-deleted), so an old D can never become a second
  // deletion obligation on a retry. draftId is the ONE external object to delete (null if none).
  const recovery = svcRec ? await classifyMainDraftRecovery(svcRec, cfg.configId) : { draftId: prior.draftId, bothRef: false, intentStatus: null };
  const priorDraftId = recovery.draftId ?? prior.draftId;
  if (priorDraftId) {
    const deleted = await deleteDraftOrder(priorDraftId);   // ONE external delete for the ONE object
    if (!deleted) {
      await releaseHeldBenefit(held, cfg.configId, priced.authUserId, lease.token);
      console.error('[checkout] prior draft deletion not confirmed:', priorDraftId);
      return { ok:false, code:'error', message: ERR_STALE_DRAFT };
    }
    // §OPTION-3-v4 #4 deletion confirmed → ONE owner-gated atomic transition that BOTH clears
    // config.shopify_cart_id AND supersedes the intent. We do NOT then run a second (expected-old-id)
    // clear: that pair self-conflicted (the transition already nulled the cart id, so the second clear
    // found null≠old and failed closed). Idempotent — a retry after this transition sees no D and does
    // not delete D again. false → we lost the lease → fail closed.
    if (!(await supersedeMainDraftOwned(cfg.configId, lease.token, priorDraftId))) {
      await releaseHeldBenefit(held, cfg.configId, priced.authUserId, lease.token);
      console.error('[checkout] owner-gated main-draft transition failed (ownership lost) — failing closed');
      return { ok:false, code:'error', message: ERR_IN_PROGRESS };
    }
  }

  // §OPTION-3-v4 #3 OWNER-GATED persist of the CANONICAL checkout fields (status + pricing + benefit +
  // artwork) in ONE token-gated statement — replacing the previous token-UNGATED upsertConfiguration
  // write window. A stale worker (lease reclaimed) matches zero rows → false → fail closed. The
  // canonical fields are persisted atomically under the current checkout token, not merely copied into
  // the checkout_snapshot JSON.
  if (!(await persistConfigCheckoutOwned({
        configId: cfg.configId, token: lease.token, status: 'checkout_pending',
        basePriceCents: priced.basePriceCents, surchargeCents: priced.surchargeCents,
        totalPriceCents: finalTotalCents, unitRateCents: priced.unitRateCents,
        preBenefitTotalCents: priced.preBenefitTotalCents, savingsCents: priced.savingsCents,
        benefitType: held.benefitType, benefitAmountCents: held.benefitAmountCents, sampleOrderId: held.sampleOrderId,
        freeSampleSet: priced.freeSampleSet, freeSampleSource: priced.freeSampleSource, authUserId: priced.authUserId,
        frontPath: paths.frontPath, backPath: paths.backPath, supporting: paths.supporting,
        snapshot: { adjusted, paths, at: new Date().toISOString() },
      }))) {
    await releaseHeldBenefit(held, cfg.configId, priced.authUserId, lease.token);
    console.error('[checkout] owner-gated canonical persist failed (ownership lost) — failing closed');
    return { ok:false, code:'error', message: ERR_IN_PROGRESS };
  }

  const attribution = await getCheckoutAttribution();

  const attributes: DraftOrderAttr[] = [
    // §hide-internal technical linkage id — hidden from the customer via underscore prefix,
    // still on the order + Admin API + webhook. Reader: app/api/shopify/orders/route.ts
    // (reads '_BUGO Configuration ID' first, falls back to legacy 'BUGO Configuration ID').
    { key:'_BUGO Configuration ID', value: cfg.configId },
    ...checkoutAttributionAttributes(attribution),
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
  // §P0-2 OWNERSHIP REVALIDATION + RENEWAL immediately before minting a payable draft. If the lease
  // TTL elapsed while we were working and a newer request reclaimed it, renew returns false and we
  // ABORT without creating a second payable draft. On success the lease clock is reset, so the
  // create + read-back + persist below complete inside a window no other request can reclaim.
  if (!(await renewCheckoutLease(cfg.configId, lease.token))) {
    console.error('[checkout] lease ownership lost before draft creation — aborting WITHOUT touching benefit state');
    return { ok:false, code:'error', message: ERR_IN_PROGRESS };
  }

  // §OPTION-3 DURABLE PRE-CREATE INTENT. Written to BUGO's DB BEFORE the Shopify create call, so a
  // hard process death between Shopify create and shopify_cart_id persistence cannot let a retry
  // blindly mint a SECOND payable draft. The decision classifies the durable state:
  //   created         → no prior payable draft on record; safe to create.
  //   existing_draft  → a draft id is already recorded → delete-confirm it before replacing.
  //   unknown_pending → a prior pre-create intent with NO draft id (the crash window): a payable
  //                     draft MAY exist in Shopify we cannot see → FAIL CLOSED, record reconcile.
  //   not_owner/error → concurrency or DB failure → FAIL CLOSED.
  const intent = await beginCheckoutIntent({
    configId: cfg.configId, token: lease.token, source: 'main_checkout',
    sampleOrderId: held.sampleOrderId, benefitType: held.benefitType,
    benefitAmountCents: held.benefitAmountCents, expectedTotalCents: finalTotalCents, expectedCurrency: 'EUR',
  });
  if (!intent.ok) {
    // Do NOT release the benefit on unknown_pending: a payable discounted draft may exist. Keep the
    // benefit reserved and surface for reconciliation. On not_owner/error, also fail closed.
    if (intent.state === 'unknown_pending') {
      await recordOrphanDraft({
        draftOrderId: `unknown:${cfg.configId}`, source:'main_checkout', configId: cfg.configId,
        benefitType: held.benefitType, benefitAmountCents: held.benefitAmountCents, authUserId: priced.authUserId,
        reason:'intent_pending_no_draft_id_possible_orphan',
      });
      console.error('[checkout] CRITICAL: durable intent pending with no draft id — possible unseen payable draft, failing closed');
      return { ok:false, code:'error', message: ERR_STALE_DRAFT };
    }
    return { ok:false, code:'error', message: intent.state === 'not_owner' ? ERR_IN_PROGRESS : ERR_PREP };
  }
  if (intent.state === 'existing_draft') {
    // §5 A draft id is on record from a prior attempt. This may be the SAME external object as
    // configurations.shopify_cart_id — it is ONE Shopify draft, so we delete-confirm it ONCE and
    // then coherently transition BOTH BUGO references (config + intent) to a safe replacement state.
    const deleted = await deleteDraftOrder(intent.draftId);
    if (!deleted) {
      console.error('[checkout] recorded-intent draft deletion not confirmed:', intent.draftId);
      return { ok:false, code:'error', message: ERR_STALE_DRAFT };
    }
    // atomically clear config.shopify_cart_id (if it referenced this same draft) AND supersede intent.
    const svc = createSupabaseServiceClient();
    if (svc) await supersedePriorConfigDraft(svc, cfg.configId, intent.draftId);
    const superseded = await resolveCheckoutIntent(cfg.configId, lease.token, 'superseded');
    if (!superseded) {
      console.error('[checkout] intent supersede after delete not confirmed — failing closed');
      return { ok:false, code:'error', message: ERR_STALE_DRAFT };
    }
    // Re-open a fresh pending intent for the replacement. It MUST come back exactly 'created';
    // anything else (not_owner / unknown_pending / error) → fail closed, no replacement create.
    const reopened = await beginCheckoutIntent({
      configId: cfg.configId, token: lease.token, source: 'main_checkout',
      sampleOrderId: held.sampleOrderId, benefitType: held.benefitType,
      benefitAmountCents: held.benefitAmountCents, expectedTotalCents: finalTotalCents, expectedCurrency: 'EUR',
    });
    if (!(reopened.ok && reopened.state === 'created')) {
      console.error('[checkout] re-begin intent after supersede not clean:', reopened.state, '— failing closed');
      return { ok:false, code:'error', message: reopened.state === 'not_owner' ? ERR_IN_PROGRESS : ERR_STALE_DRAFT };
    }
  }

  // §OPTION-3-v4 #2 STALE-HELD-BENEFIT REVALIDATION immediately before creating a DISCOUNTED draft.
  // Renewing the config lease does not prove the benefit reservation is still THIS config's — after
  // a long idle, another config (C2) may have taken it over. Atomically re-prove/refresh ownership
  // of the exact benefit; if it's no longer ours, do NOT mint a discounted draft with stale
  // held.benefitAmountCents — fail closed so the user restarts pricing cleanly.
  if (held.benefitType) {
    const stillOwned = await revalidateBenefitOwned({
      benefitType: held.benefitType, configId: cfg.configId,
      authUserId: priced.authUserId, sampleOrderId: held.sampleOrderId,
    });
    if (!stillOwned) {
      console.error('[checkout] benefit no longer owned by this config before create — failing closed (no discounted draft)');
      await resolveCheckoutIntent(cfg.configId, lease.token, 'superseded');
      return { ok:false, code:'error', message: ERR_IN_PROGRESS };
    }
  }

  const draft = await createBugoDraftOrder({
    configId: cfg.configId, collectionCode: cfg.collectionCode,
    title: `BUGO ${cfg.collectionCode} — ${formatQty(cfg.quantity, cfg.locale)} Stück`,
    quantity: cfg.quantity, totalPriceCents: finalTotalCents, attributes,
    // §checkout-locale open Shopify checkout in the storefront language the customer was using.
    locale: cfg.locale,
  });
  if (!draft.ok) {
    // §OPTION-3-v4 #4 CREATE-CERTAINTY decision. A timeout/abort/HTTP-5xx after the request was
    // dispatched (unknown_create_outcome) means a payable draft MAY exist unseen → NEVER release the
    // one-time benefit and keep the durable intent blocking. Only definitely_no_draft /
    // confirmed_deleted may release the benefit and reset the intent for a clean retry.
    const dec = createCertaintyDecision(draft.certainty);
    if (dec.keepIntentBlocking) {
      // The draft may exist (unknown) OR a known draft's deletion was not confirmed. Record an
      // orphan when we have a concrete id; retain benefit; leave intent draft_pending (blocking).
      const orphanId = draft.cleanup?.orphanDraftId ?? (draft.certainty === 'unknown_create_outcome' ? `unknown:${cfg.configId}` : null);
      if (orphanId) {
        await recordOrphanDraft({
          draftOrderId: orphanId, source:'main_checkout', configId: cfg.configId,
          benefitType: held.benefitType, benefitAmountCents: held.benefitAmountCents, authUserId: priced.authUserId,
          reason: draft.certainty === 'unknown_create_outcome' ? 'create_unknown_outcome_possible_draft' : 'amount_mismatch_cleanup',
        });
      }
      console.error('[checkout] create failed, draft may exist (', draft.certainty, ') — benefit RETAINED, intent blocking');
      return { ok:false, code:'error', message: ERR_STALE_DRAFT };
    }
    // definitely_no_draft / confirmed_deleted → no payable draft remains. Reset the intent to a
    // clean state and release the benefit (we still own the lease here).
    await resolveCheckoutIntent(cfg.configId, lease.token, 'superseded');
    await releaseHeldBenefit(held, cfg.configId, priced.authUserId, lease.token);
    console.error('[checkout] draftOrderCreate failed (', draft.certainty, '):', draft.reason, draft.message);
    return { ok:false, code: draft.reason, message: draft.message };
  }

  // §OPTION-3 record the draft id on the DURABLE INTENT immediately after Shopify create and BEFORE
  // persisting shopify_cart_id. Token-owned: if we lost the lease, attach fails → delete-verify the
  // draft and fail closed.
  if (!(await attachCheckoutIntentDraft(cfg.configId, lease.token, draft.draftOrderId))) {
    const deleted = await deleteDraftOrder(draft.draftOrderId);
    const outcome = orphanCleanupOutcome(deleted);
    if (outcome.releaseBenefit) {
      await releaseHeldBenefit(held, cfg.configId, priced.authUserId, lease.token);
      console.error('[checkout] intent attach failed (ownership lost); new draft deletion CONFIRMED — benefit released');
      return { ok:false, code:'error', message: ERR_IN_PROGRESS };
    }
    await recordOrphanDraft({
      draftOrderId: draft.draftOrderId, source:'main_checkout', configId: cfg.configId,
      benefitType: held.benefitType, benefitAmountCents: held.benefitAmountCents, authUserId: priced.authUserId,
      reason:'intent_attach_lost_owner_delete_unconfirmed',
    });
    console.error('[checkout] CRITICAL: intent attach failed AND deletion UNCONFIRMED — orphan recorded:', draft.draftOrderId);
    return { ok:false, code:'error', message: ERR_STALE_DRAFT };
  }

  // §OPTION-3-v4 #3 OWNER-GATED persist of the CANONICAL checkout fields (status + pricing + benefit +
  // artwork) in ONE token-gated statement — never overwritten by a stale worker, and never via a
  // token-UNGATED upsertConfiguration. The canonical fields are persisted atomically under the current
  // checkout token, not merely copied into checkout_snapshot JSON.
  const savedFields = await persistConfigCheckoutOwned({
    configId: cfg.configId, token: lease.token, status: 'checkout_pending',
    basePriceCents: priced.basePriceCents, surchargeCents: priced.surchargeCents,
    totalPriceCents: finalTotalCents, unitRateCents: priced.unitRateCents,
    preBenefitTotalCents: priced.preBenefitTotalCents, savingsCents: priced.savingsCents,
    benefitType: held.benefitType, benefitAmountCents: held.benefitAmountCents, sampleOrderId: held.sampleOrderId,
    freeSampleSet: priced.freeSampleSet, freeSampleSource: priced.freeSampleSource, authUserId: priced.authUserId,
    frontPath: paths.frontPath, backPath: paths.backPath, supporting: paths.supporting,
    snapshot: { adjusted, paths, at: new Date().toISOString() },
  });

  // §OPTION-3-v2 #3 OWNERSHIP-GATED persist of shopify_cart_id + intent 'draft_created', in ONE DB
  // transaction that verifies configurations.checkout_lock_token = OUR token under row lock. A stale
  // owner (whose lease B reclaimed while we were at Shopify) can NEVER persist the cart id, move the
  // config to checkout_pending, or return success. false ⇒ we lost ownership OR the field-persist
  // failed → delete-verify the just-created draft and fail closed (never a dangling payable draft).
  const persisted = savedFields && await persistConfigDraftOwned(cfg.configId, lease.token, draft.draftOrderId);
  if (!persisted) {
    const deleted = await deleteDraftOrder(draft.draftOrderId);
    const outcome = orphanCleanupOutcome(deleted);
    if (outcome.releaseBenefit) {
      await releaseHeldBenefit(held, cfg.configId, priced.authUserId, lease.token);
      console.error('[checkout] ownership-gated persist failed; new draft deletion CONFIRMED — benefit released');
      return { ok:false, code:'error', message: ERR_PREP };
    }
    await recordOrphanDraft({
      draftOrderId: draft.draftOrderId, source:'main_checkout', configId: cfg.configId,
      benefitType: held.benefitType, benefitAmountCents: held.benefitAmountCents, authUserId: priced.authUserId,
      reason:'main_persist_failed_delete_unconfirmed',
    });
    console.error('[checkout] CRITICAL: ownership-gated persist failed AND deletion UNCONFIRMED — orphan recorded, benefit RETAINED:', draft.draftOrderId);
    return { ok:false, code:'error', message: ERR_STALE_DRAFT };
  }

  // §OPTION-3-v4 #6 mark the intent resolved ONLY if we still own the configuration lease, and
  // CHECK the result. If ownership was lost between persist and resolve (B reclaimed the lease and
  // may be replacing the draft), a STALE owner must NOT return a checkout success. The draft +
  // intent are left in a coherent 'draft_created' state that the current owner / a retry recovers
  // as ONE object; this request fails closed instead of handing the user a URL B may be deleting.
  const finalOwned = await resolveConfigIntentOwned(cfg.configId, lease.token);
  if (!finalOwned) {
    console.error('[checkout] lost ownership before final resolve — NOT returning checkout success');
    return { ok:false, code:'error', message: ERR_IN_PROGRESS };
  }
  return { ok:true, checkoutUrl: draft.invoiceUrl };
  } finally {
    // §P0-5 release the lease using OUR token so a legitimate retry isn't blocked — and so a stale
    // owner can never release a newer owner's lease.
    await releaseCheckoutLease(cfg.configId, lease.token);
  }
}
