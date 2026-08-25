import 'server-only';
import { randomUUID } from 'node:crypto';
import type { Locale } from '@/i18n/config';
import { listProducts } from '@/repositories/catalog';
import { validateQuantity, isIntroQty } from '@/lib/quantity';
import { INTENSE_SURCHARGE_CENTS } from '@/config/shopify';
import { createSupabaseServiceClient } from '@/lib/supabase/server';
import { isSupabaseConfigured } from '@/lib/supabase/env';
import { SHAPES } from '@/lib/configurator/shapes';
import { priceQuantitySafe, type PriceTier } from '@/lib/pricing/tiers';
import { isDesignMode, normalizeDesignMode } from '@/lib/configurator/design-mode';
import { getSettings, getSettingsAuthoritative } from '@/repositories/settings';
import { getCustomerUser, ensureCustomerRow } from '@/lib/customer/session';
import { deleteDraftOrder } from '@/lib/shopify/draft-order';
import {
  resolveDraftLookup, firstOrderEligible, sampleCreditCents, staleReservationDecision, resolveLeaseClaim,
} from '@/lib/checkout/guards';

// Client-supplied config (untrusted). Prices are IGNORED and recomputed server-side.
export type IncomingConfig = {
  configId: string; locale: Locale;
  collectionCode: string; scentCode: string | null; scentCode2?: string | null;
  intensity: 'normal' | 'intense'; shape: string; quantity: number;
  frontInstructions: string; sameBackAsFront: boolean; backInstructions: string;
  designMode?: 'bugo_creates' | 'ready_file';
};
export type BenefitType = 'sample_credit' | 'first_order_5pct';
export type Priced = { ok: true; productId: string; productCode: string;
    basePriceCents: number; unitRateCents: number; surchargeCents: number;
    preBenefitTotalCents: number; totalPriceCents: number;
    baseTotalCents: number; savingsCents: number; freeSampleSet: boolean; freeSampleSource: string | null;
    benefitType: BenefitType | null; benefitAmountCents: number; sampleOrderId: string | null; authUserId: string | null }
  | { ok: false; error: string };

// Completion pass §2-4: server-authoritative "best of" benefit — an unredeemed paid
// sample credit (€20, from a verified `sample_orders` purchase) vs. the 5% first-order
// member benefit (authenticated customer, zero prior linked orders). Never trusts client
// input; both signals are read fresh from the DB via the service client. Authenticated
// customers only — guests get neither (matches the brief: credit redemption and the
// first-order benefit both require an account so they can't be forged/transferred).
async function computeBestBenefit(preBenefitTotalCents: number): Promise<{
  type: BenefitType | null; amountCents: number; sampleOrderId: string | null; authUserId: string | null;
}> {
  const none = { type: null as BenefitType | null, amountCents: 0, sampleOrderId: null as string | null, authUserId: null as string | null };
  if (preBenefitTotalCents <= 0) return none;
  const user = await getCustomerUser();
  if (!user) return none;
  if (!isSupabaseConfigured()) return { ...none, authUserId: user.id };
  const svc = createSupabaseServiceClient();
  if (!svc) return { ...none, authUserId: user.id };
  // §HIGH-8: read settings AUTHORITATIVELY. If the DB read errors we must NOT fall back to the
  // defaults (which enable the first-order benefit) — an unknown settings state fails closed.
  const { loaded: settingsLoaded, settings } = await getSettingsAuthoritative();

  // §P0: make sure this authenticated customer has a `customers` row BEFORE first-order
  // eligibility is evaluated — a user can register and go straight to checkout without ever
  // visiting /konto, and the 5% benefit must not be silently lost for lack of a row.
  await ensureCustomerRow(user);

  // §P0/§P1 GUEST-CREDIT LINKING: a paid sample bought as a guest has auth_user_id = null and
  // its email set by the webhook. When the purchaser later signs in with the SAME VERIFIED
  // email, attach that purchase so the €20 credit becomes findable. Gated on emailVerified
  // (never a Dashboard assumption): an unconfirmed email can't claim guest commerce. Only
  // ever touches rows whose email equals the caller's own verified session email.
  if (user.emailVerified && user.email) {
    // §SMALL EXACT identity match — never ILIKE, whose `%`/`_` wildcards are legal in an email
    // local part and could attach ANOTHER purchaser's guest sample to this account. user.email is
    // already normalized at the source (getCustomerUser), and sample_orders emails are stored
    // normalized (webhook + sample insert), so `.eq` is a safe exact match.
    const { data: custLink } = await svc.from('customers').select('id').eq('auth_user_id', user.id).maybeSingle();
    await svc.from('sample_orders')
      .update({ auth_user_id: user.id, customer_id: custLink?.id ?? null })
      .is('auth_user_id', null).eq('payment_state', 'paid').eq('email', user.email);
  }

  // Unredeemed paid sample credit for this user (now including any just-linked guest row).
  // Excludes credits already reserved by a DIFFERENT, still-valid checkout so a second tab
  // doesn't even PREVIEW a credit another in-flight order holds (the authoritative guard is
  // the atomic reserve at finalize; this just keeps the preview honest).
  const sampleRes = await svc.from('sample_orders')
    .select('id, credit_cents, credit_reserved_config_id, credit_reservation_expires_at')
    .eq('auth_user_id', user.id).eq('payment_state', 'paid').is('credit_used_at', null)
    .order('created_at', { ascending: true }).limit(1).maybeSingle();
  // §P0-4 FAIL CLOSED: a DB error here yields 0 credit (guard), never a preview/grant we can't prove.
  const creditCents = sampleCreditCents({
    row: sampleRes.data as any, error: sampleRes.error,
    preBenefitTotalCents, nowMs: Date.now(),
  });
  const sampleRow = creditCents > 0 ? (sampleRes.data as any) : null;

  // §P0-4/§HIGH-8 FIRST-ORDER ELIGIBILITY: based on REAL paid main-order history only, and only
  // when the authoritative settings loaded. Every DB read is checked; ANY error/ambiguity fails
  // closed to "not eligible" (see firstOrderEligible). An abandoned/unpaid/cancelled order never
  // permanently consumes the benefit; a 'consumed' claim blocks re-grant. Admin-managed % + on/off.
  let fivePctCents = 0;
  const fo = settings.commerce.firstOrder;
  const custRes = await svc.from('customers').select('id').eq('auth_user_id', user.id).maybeSingle();
  const cust = custRes.error ? null : custRes.data;   // §HIGH-8 customer lookup error → fail closed
  if (cust) {
    const count = await svc.from('orders').select('id', { count: 'exact', head: true })
      .eq('customer_id', cust.id).eq('order_kind', 'main').eq('payment_state', 'paid');
    const claim = await svc.from('first_order_claims').select('state').eq('customer_id', cust.id).maybeSingle();
    const eligible = firstOrderEligible({
      settingsLoaded, firstOrderEnabled: fo.enabled, firstOrderPercent: fo.percent,
      count: { count: count.count, error: count.error },
      claim: { data: claim.data as any, error: claim.error },
    });
    if (eligible) fivePctCents = Math.round(preBenefitTotalCents * (fo.percent / 100));
  }

  if (creditCents <= 0 && fivePctCents <= 0) return { ...none, authUserId: user.id };
  if (creditCents >= fivePctCents) return { type:'sample_credit', amountCents: creditCents, sampleOrderId: sampleRow!.id, authUserId: user.id };
  return { type:'first_order_5pct', amountCents: fivePctCents, sampleOrderId: null, authUserId: user.id };
}

const SHAPE_IDS = new Set(SHAPES.map(s => s.id));

// ============================================================================
// §P0 AUTHORITATIVE CATALOG FOR CHECKOUT
// ----------------------------------------------------------------------------
// The single source of truth used to VALIDATE and PRICE a configured order. In
// production this is read fresh from Supabase via the service client, so that
// Admin edits, DB `product_scents`, active tiers and qty rules are exactly what
// checkout enforces — no seed drift. Any DB/query error THROWS so the caller can
// fail closed (never invoice from stale seed data).
// ============================================================================
type AuthProduct = {
  id: string; code: string; collectionCode: string; isActive: boolean;
  minQty: number; maxQty: number; qtyStep: number;
  tiers: PriceTier[]; scentCodes: string[]; intenseSurchargeCents: number;
};

async function loadAuthoritativeProduct(collectionCode: string): Promise<AuthProduct | null> {
  const c = createSupabaseServiceClient();
  if (!c) throw new Error('supabase_service_unavailable');
  const { data, error } = await c.from('products')
    .select(`id, product_code, is_active, min_qty, max_qty, qty_step,
      collections!inner(code),
      product_price_tiers(min_qty, unit_price_cents, is_active),
      product_options(key, price_delta_cents),
      product_scents(scents(code, is_active))`)
    .eq('collections.code', collectionCode)
    .eq('is_active', true)
    .limit(1);
  if (error) throw error;
  const p: any = (data ?? [])[0];
  if (!p) return null;
  const tiers: PriceTier[] = (p.product_price_tiers ?? [])
    .filter((t: any) => t.is_active !== false)
    .map((t: any) => ({ minQty: t.min_qty, ratePer1000Cents: t.unit_price_cents }));
  // Only ACTIVE scents explicitly associated with THIS product are checkout-valid.
  const scentCodes: string[] = (p.product_scents ?? [])
    .map((r: any) => r.scents).filter((s: any) => s && s.is_active !== false).map((s: any) => s.code);
  const intenseOpt = (p.product_options ?? []).find((o: any) => o.key === 'intense_fragrance');
  return {
    id: p.id, code: p.product_code, collectionCode,
    isActive: p.is_active !== false,
    minQty: p.min_qty ?? 1000, maxQty: p.max_qty ?? 100000, qtyStep: p.qty_step ?? 1000,
    tiers, scentCodes,
    intenseSurchargeCents: intenseOpt ? intenseOpt.price_delta_cents : INTENSE_SURCHARGE_CENTS,
  };
}

// Server truth: recompute price from the AUTHORITATIVE catalog; reject invalid combos.
// Production checkout FAILS CLOSED on any DB/pricing lookup failure — it never silently
// prices from the shipped seed. Seed is used ONLY when Supabase is unconfigured (dev).
export async function validateAndPrice(c: IncomingConfig): Promise<Priced> {
  let src: Omit<AuthProduct, 'isActive' | 'collectionCode'>;
  if (isSupabaseConfigured()) {
    let auth: AuthProduct | null;
    try { auth = await loadAuthoritativeProduct(c.collectionCode); }
    catch (e) {
      console.error('[pricing] authoritative lookup failed:', e instanceof Error ? e.message : e);
      return { ok:false, error:'pricing_unavailable' };   // FAIL CLOSED — never seed-fallback in prod
    }
    if (!auth || !auth.isActive) return { ok:false, error:'invalid_collection' };
    if (!auth.tiers.length) return { ok:false, error:'pricing_unavailable' };   // no approved price
    src = auth;
  } else {
    const p = listProducts(c.locale).find(x => x.collectionCode === c.collectionCode);
    if (!p) return { ok:false, error:'invalid_collection' };
    const seedTiers: PriceTier[] = (p.tiers.length ? p.tiers : [{ minQty: p.minQty, unitPriceCents: p.basePriceCents }])
      .map(t => ({ minQty: t.minQty, ratePer1000Cents: t.unitPriceCents }));
    src = { id: p.id, code: p.code, minQty: p.minQty, maxQty: p.maxQty, qtyStep: p.qtyStep,
      tiers: seedTiers, scentCodes: p.scentCodes, intenseSurchargeCents: INTENSE_SURCHARGE_CENTS };
  }

  // Validate against AUTHORITATIVE rules (DB qty rules, DB active scents).
  // §INTRO-250-500 — 250/500 are valid ONLY when this product actually carries an intro price
  // tier for them. Products without an intro tier keep rejecting 250/500 as invalid_quantity, and
  // even when allowed, pricing still fails closed below if no active tier covers the quantity.
  const allowIntro = src.tiers.some(t => isIntroQty(t.minQty));
  if (validateQuantity(c.quantity, { min: src.minQty, max: src.maxQty, step: src.qtyStep, allowIntro })) return { ok:false, error:'invalid_quantity' };
  if (!c.scentCode || !src.scentCodes.includes(c.scentCode)) return { ok:false, error:'invalid_scent' };
  if (c.scentCode2) {
    if (!src.scentCodes.includes(c.scentCode2)) return { ok:false, error:'invalid_scent2' };
    if (c.scentCode2 === c.scentCode) return { ok:false, error:'duplicate_scent' };
  }
  if (!SHAPE_IDS.has(c.shape as any)) return { ok:false, error:'invalid_shape' };
  if (c.intensity !== 'normal' && c.intensity !== 'intense') return { ok:false, error:'invalid_intensity' };
  // §P0-3 never trust an arbitrary design-mode string from the browser. Undefined is allowed
  // (legacy carts default safely at persistence); any other non-union value is rejected.
  if (c.designMode !== undefined && !isDesignMode(c.designMode)) return { ok:false, error:'invalid_design_mode' };

  // §P0/HIGH-12 no future-tier fallback: if NO active tier covers this quantity, pricing FAILS
  // CLOSED — never charge a smaller quantity at a larger tier's bulk rate.
  const q = priceQuantitySafe(src.tiers, c.quantity);
  if (!q) { console.error('[pricing] no active tier covers quantity', c.quantity, 'for', c.collectionCode); return { ok:false, error:'pricing_unavailable' }; }
  // §P0-2/§P0-3: the intense-fragrance surcharge is a PER-1,000-UNITS rate, not per order.
  // total surcharge = (quantity / 1000) × rate. Generic product options remain per-order.
  const surchargeCents = c.intensity === 'intense'
    ? Math.round(src.intenseSurchargeCents * (c.quantity / 1000))
    : 0;
  const settings = await getSettings();
  const freeSampleSet = settings.sample.enabled && c.quantity >= settings.sample.threshold;

  const preBenefitTotalCents = q.totalCents + surchargeCents;   // tier total + surcharge, before any benefit
  const benefit = await computeBestBenefit(preBenefitTotalCents);
  const totalPriceCents = Math.max(0, preBenefitTotalCents - benefit.amountCents);  // never negative

  return { ok:true, productId: src.id, productCode: src.code,
    basePriceCents: q.ratePer1000Cents,        // selected per-1,000 rate (keeps "ab X/1.000" display)
    unitRateCents: q.ratePer1000Cents,
    surchargeCents,
    preBenefitTotalCents,
    totalPriceCents,                            // FULL authoritative order total, after benefit
    baseTotalCents: q.baseTotalCents, savingsCents: q.savingsCents,
    freeSampleSet, freeSampleSource: freeSampleSet ? 'free_5k' : null,
    benefitType: benefit.type, benefitAmountCents: benefit.amountCents,
    sampleOrderId: benefit.sampleOrderId, authUserId: benefit.authUserId };
}

export type PersistInput = IncomingConfig & Priced & {
  frontPath?: string | null; backPath?: string | null; supporting?: { field:string; path:string }[];
  status?: 'draft' | 'checkout_pending'; shopifyCartId?: string | null;
};

// Idempotent upsert keyed by configId (retries reuse the same row).
//
// §P0-1 / CHECKOUT-UPDATE-SEMANTICS — omitted ≠ cleared. This function distinguishes three
// states for optional persisted fields (artwork paths, Shopify draft id, second scent, design
// mode, status):
//   • property absent / undefined  → PRESERVE the existing value (on create: a safe initializer)
//   • property === null            → EXPLICITLY clear (only where clearing is meaningful)
//   • property has a value         → replace
// This is what stops beginCheckout() (which never sends paths or the shopify id) from wiping an
// existing configuration's active Draft Order id or uploaded-artwork references before
// finalizeCheckout() has intentionally invalidated them. The always-authoritative columns
// (price, quantity, scent, etc.) are recomputed server truth and always written.
export async function upsertConfiguration(input: PersistInput): Promise<{ ok:true } | { ok:false; message:string }> {
  if (!isSupabaseConfigured()) return { ok:false, message:'Supabase ist nicht konfiguriert.' };
  const c = createSupabaseServiceClient();
  if (!c) return { ok:false, message:'Supabase ist nicht konfiguriert.' };
  if (!('productCode' in input) || !input.ok) return { ok:false, message:'invalid_config' };
  // Map the stable catalog product_code (e.g. BUGO-STD) to the real products.id UUID.
  const { data: prod, error: lookupErr } = await c.from('products').select('id').eq('product_code', input.productCode).maybeSingle();
  if (lookupErr) return { ok:false, message: lookupErr.message };
  if (!prod) console.warn('[configurations] no products row for product_code', input.productCode, '- storing null product_id');

  // Is this a create or an update? A DB error here fails closed (never blind-insert/overwrite).
  const { data: existing, error: existErr } = await c.from('configurations').select('id').eq('id', input.configId).maybeSingle();
  if (existErr) return { ok:false, message: existErr.message };
  const isCreate = !existing;

  // Always-authoritative columns — recomputed server truth, written on every call.
  const patch: Record<string, any> = {
    locale: input.locale, product_id: prod?.id ?? null, collection_code: input.collectionCode,
    quantity: input.quantity, scent_code: input.scentCode, intensity: input.intensity, shape: input.shape,
    front_instructions: input.frontInstructions,
    same_back_as_front: input.sameBackAsFront,
    back_instructions: input.sameBackAsFront ? null : input.backInstructions,
    base_price_cents: input.basePriceCents, surcharge_cents: input.surchargeCents, total_price_cents: input.totalPriceCents,
    unit_rate_cents: (input as any).unitRateCents ?? null,
    free_sample_set: (input as any).freeSampleSet ?? false,
    free_sample_source: (input as any).freeSampleSource ?? null,
    savings_cents: (input as any).savingsCents ?? 0,
    pre_benefit_total_cents: (input as any).preBenefitTotalCents ?? null,
    benefit_type: (input as any).benefitType ?? null,
    benefit_amount_cents: (input as any).benefitAmountCents ?? 0,
    sample_order_id: (input as any).sampleOrderId ?? null,
    auth_user_id: (input as any).authUserId ?? null,
  };

  // §P0-1 preserve-on-omit optional fields. undefined = omitted (do NOT write the column at all);
  // null = explicit clear; value = replace. On INSERT an omitted column simply takes the table's
  // OWN default (supporting → '[]', design_mode → 'bugo_creates', status → 'draft', the rest →
  // NULL) — so we never bake create-defaults into app code, and the same `patch` is safe to use
  // for the update-fallback below without ever nulling a value another writer just set.
  const setOpt = (col: string, v: unknown) => { if (v !== undefined) patch[col] = v; };
  setOpt('front_path', input.frontPath);
  setOpt('back_path', input.backPath);
  setOpt('supporting', input.supporting);
  setOpt('shopify_cart_id', input.shopifyCartId);
  setOpt('scent_code_2', input.scentCode2);
  // design_mode: a provided value is normalized; omitted → column omitted (DB default / preserve).
  if (input.designMode !== undefined) patch['design_mode'] = normalizeDesignMode(input.designMode);
  // status: provided → set; omitted → column omitted (never silently downgrade checkout_pending→draft).
  if (input.status !== undefined) patch['status'] = input.status;

  if (isCreate) {
    const { error } = await c.from('configurations').insert({ id: input.configId, ...patch });
    if (error) {
      // Idempotency: a concurrent create won the race (unique_violation on the id PK). Fall back
      // to an UPDATE with the SAME omit-preserving patch — never a blanket upsert that would null
      // omitted fields. Any other error is surfaced.
      if ((error as any)?.code === '23505') {
        const { error: uErr } = await c.from('configurations').update(patch).eq('id', input.configId);
        if (uErr) return { ok:false, message: uErr.message };
      } else {
        return { ok:false, message: error.message };
      }
    }
  } else {
    const { error } = await c.from('configurations').update(patch).eq('id', input.configId);
    if (error) return { ok:false, message: error.message };
  }
  return { ok:true };
}

// ============================================================================
// §P0-3  ATOMIC BENEFIT RESERVATION (finalize step only — validateAndPrice stays pure).
// ----------------------------------------------------------------------------
// computeBestBenefit() decides WHICH benefit a customer is eligible for; it performs no
// writes. The actual single-use guarantee happens here, right before the Draft Order is
// created, via the DB RPCs in migration 0015. Two concurrent finalizes can therefore never
// both secure the same €20 credit or the same first-order 5% — the loser is transparently
// dropped to the full pre-benefit price (its invoice shows the real amount before payment).
export type PricedOk = Extract<Priced, { ok: true }>;
export type HeldBenefit = { benefitType: BenefitType | null; benefitAmountCents: number; sampleOrderId: string | null };

const RESERVE_TTL_MINUTES = 30;

// §P0-1/§P0-5/§P0-6 OWNERSHIP-TOKEN CHECKOUT LEASE. Two nearly-simultaneous finalizeCheckout
// calls for the SAME configuration must never each create a payable Shopify draft. claim_config_
// checkout() (migration 0021) atomically grants a lease to at most one caller AND RETURNS A UNIQUE
// TOKEN identifying that owner. release requires the matching token, so a stale owner (whose lease
// already expired and was re-granted to a newer caller) can NEVER release the newer owner's lock.
//   • real token   → this caller owns the lease → proceed
//   • held (null)   → another in-flight finalize owns it → tell the customer to retry
//   • RPC missing / any DB error → FAIL CLOSED (§P0-6): do NOT continue without the guard.
// §P0-2 TTL was 90s; raised to 120s AND paired with an ownership REVALIDATION+renewal
// (renewCheckoutLease) that runs immediately before the payment-critical Shopify create. The 15s
// Shopify Admin timeout is far below the TTL, so create + read-back + persist always finish inside
// one freshly-renewed lease window — no other request can reclaim the lease mid-operation. Token
// ownership prevents a stale owner from releasing; the renewal check prevents a stale owner from
// CONTINUING after a newer request has reclaimed.
const CHECKOUT_LEASE_SECONDS = 120;
const DEV_LEASE_TOKEN = 'dev-no-store';
export type LeaseAcquire = { ok: true; token: string } | { ok: false; reason: 'in_progress' | 'error' };
export async function acquireCheckoutLease(configId: string): Promise<LeaseAcquire> {
  const svc = createSupabaseServiceClient();
  if (!svc) return { ok: true, token: DEV_LEASE_TOKEN };  // dev/unconfigured: single process, no store
  const { data, error } = await svc.rpc('claim_config_checkout',
    { p_config_id: configId, p_lease_seconds: CHECKOUT_LEASE_SECONDS });
  const res = resolveLeaseClaim({ data, error: (error as any) ?? null });
  if (!res.ok && res.reason === 'error') {
    // Includes PGRST202/42883 (function absent → migration 0021 not applied). FAIL CLOSED (§P0-6).
    console.error('[checkout] lease claim failed — failing closed:', (error as any)?.message ?? (error as any)?.code);
  }
  return res;
}

// §P0-2 REVALIDATE + RENEW lease ownership right before a payment-critical transition (creating a
// payable Shopify draft). Returns true ONLY if THIS token still owns the lease — and, when it does,
// resets the lease clock (extends the TTL) so the create/persist finishes inside the window. Returns
// FALSE (fail closed) when ownership was lost/reclaimed, the RPC is missing, or any DB error occurs —
// the caller must then abort WITHOUT creating another payable draft.
export async function renewCheckoutLease(configId: string, token: string): Promise<boolean> {
  const svc = createSupabaseServiceClient();
  if (!svc || token === DEV_LEASE_TOKEN) return true;     // dev/unconfigured: single process
  const { data, error } = await svc.rpc('renew_config_checkout',
    { p_config_id: configId, p_token: token, p_lease_seconds: CHECKOUT_LEASE_SECONDS });
  if (error) {
    console.error('[checkout] lease renew failed — failing closed:', (error as any)?.message ?? (error as any)?.code);
    return false;                                         // §P0-2/§P0-6 missing RPC or DB error → fail closed
  }
  return data === true;                                   // false ⇒ ownership lost (someone reclaimed)
}
// Release ONLY if `token` still matches the current lease owner (enforced in SQL by
// release_config_checkout). A stale owner's release is a no-op.
export async function releaseCheckoutLease(configId: string, token: string): Promise<void> {
  const svc = createSupabaseServiceClient();
  if (!svc || token === DEV_LEASE_TOKEN) return;
  try { await svc.rpc('release_config_checkout', { p_config_id: configId, p_token: token }); }
  catch { /* best-effort; lease also self-expires */ }
}

// §OPTION-3 CHECKOUT-INTENT IDEMPOTENCY. A durable per-configuration record written BEFORE the
// Shopify draft is created, so a hard process death between Shopify create and BUGO persistence
// cannot cause a retry to blindly mint a SECOND payable draft. Classifies the current durable
// state so the caller can create / reuse / delete-confirm / fail closed.
export type IntentDecision =
  | { ok: true; state: 'created' }                                  // safe to create a new draft
  | { ok: true; state: 'existing_draft'; draftId: string }         // §4 ALWAYS a non-empty id
  | { ok: false; state: 'unknown_pending' }                        // hard crash window → FAIL CLOSED
  | { ok: false; state: 'not_owner' }                              // another finalize in-flight
  | { ok: false; state: 'error' };                                 // DB error / unreadable → FAIL CLOSED

export async function beginCheckoutIntent(args: {
  configId: string; token: string; source: 'main_checkout'|'sample_checkout';
  sampleOrderId: string | null; benefitType: string | null; benefitAmountCents: number;
  expectedTotalCents: number; expectedCurrency?: string;
}): Promise<IntentDecision> {
  const svc = createSupabaseServiceClient();
  if (!svc) return { ok: true, state: 'created' };                  // dev/unconfigured: single process
  const { data, error } = await svc.rpc('begin_checkout_intent', {
    p_config_id: args.configId, p_token: args.token, p_source: args.source,
    p_sample_order_id: args.sampleOrderId, p_benefit_type: args.benefitType,
    p_benefit_amount_cents: args.benefitAmountCents, p_expected_total_cents: args.expectedTotalCents,
    p_expected_currency: args.expectedCurrency ?? 'EUR',
  });
  if (error) {
    console.error('[checkout] begin_checkout_intent failed — failing closed:', (error as any)?.message ?? (error as any)?.code);
    return { ok: false, state: 'error' };
  }
  const state = data as string;
  if (state === 'created') return { ok: true, state: 'created' };
  if (state === 'existing_draft') {
    // §4 FAIL CLOSED unless we POSITIVELY read a non-empty draft id. A get-intent error, an empty
    // result, or a missing/blank shopify_draft_order_id must NEVER become existing_draft/null.
    const r = await svc.rpc('get_checkout_intent', { p_config_id: args.configId });
    if ((r as any).error) {
      console.error('[checkout] get_checkout_intent failed — failing closed:', ((r as any).error)?.message);
      return { ok: false, state: 'error' };
    }
    const row = (r.data as any)?.[0];
    const draftId = typeof row?.shopify_draft_order_id === 'string' ? row.shopify_draft_order_id.trim() : '';
    if (!draftId) {
      console.error('[checkout] existing_draft with no readable draft id — failing closed');
      return { ok: false, state: 'error' };
    }
    return { ok: true, state: 'existing_draft', draftId };
  }
  if (state === 'unknown_pending') return { ok: false, state: 'unknown_pending' };
  if (state === 'not_owner') return { ok: false, state: 'not_owner' };
  return { ok: false, state: 'error' };
}

// Record the Shopify draft id on the intent AFTER a successful create (token-owned). false ⇒ lost
// ownership → caller must fail closed (delete the just-created draft / record orphan).
export async function attachCheckoutIntentDraft(configId: string, token: string, draftId: string): Promise<boolean> {
  const svc = createSupabaseServiceClient();
  if (!svc) return true;
  const { data, error } = await svc.rpc('attach_checkout_intent_draft',
    { p_config_id: configId, p_token: token, p_draft_id: draftId });
  if (error) { console.error('[checkout] attach_checkout_intent_draft failed:', (error as any)?.message); return false; }
  return data === true;
}

// Mark the intent resolved (checkout completed) or superseded (prior draft confirmed deleted).
export async function resolveCheckoutIntent(configId: string, token: string, status: 'resolved'|'superseded'): Promise<boolean> {
  const svc = createSupabaseServiceClient();
  if (!svc) return true;
  const { data, error } = await svc.rpc('resolve_checkout_intent',
    { p_config_id: configId, p_token: token, p_status: status });
  if (error) { console.error('[checkout] resolve_checkout_intent failed:', (error as any)?.message); return false; }
  return data === true;
}


// FAIL CLOSED: a DB error returns { ok:false } — the caller must NOT treat it as "no draft"
// (that would let checkout create a SECOND payable draft). Only a successful read yields draftId.
export type DraftLookupResult = { ok: true; draftId: string | null } | { ok: false };
export async function getExistingDraftId(configId: string): Promise<DraftLookupResult> {
  const svc = createSupabaseServiceClient();
  if (!svc) return { ok: true, draftId: null };           // dev/unconfigured
  const r = await svc.from('configurations').select('shopify_cart_id').eq('id', configId).maybeSingle();
  return resolveDraftLookup(r as any);
}

// §OPTION-3-v2 #1 authoritative cross-config payment-risk classification (config + intent + orphan).
export type PriorRisk =
  | { ok: true; risk: 'safe' }
  | { ok: true; risk: 'existing_draft'; draftId: string }
  | { ok: false; risk: 'blocked' }
  | { ok: false; risk: 'error' };
export async function priorConfigPaymentRisk(svc: any, priorConfigId: string): Promise<PriorRisk> {
  const r = await svc.rpc('prior_config_payment_risk', { p_prior_config_id: priorConfigId });
  if (r.error) { console.error('[checkout] prior_config_payment_risk failed — failing closed:', r.error.message); return { ok: false, risk: 'error' }; }
  const row = (r.data as any)?.[0];
  const risk = row?.risk as string;
  if (risk === 'safe') return { ok: true, risk: 'safe' };
  if (risk === 'existing_draft') {
    const id = typeof row?.draft_id === 'string' ? row.draft_id.trim() : '';
    if (!id) return { ok: false, risk: 'blocked' };
    return { ok: true, risk: 'existing_draft', draftId: id };
  }
  return { ok: false, risk: 'blocked' };
}
export async function supersedePriorConfigDraft(svc: any, priorConfigId: string, draftId: string): Promise<boolean> {
  const r = await svc.rpc('supersede_prior_config_draft', { p_prior_config_id: priorConfigId, p_draft_id: draftId });
  if (r.error) { console.error('[checkout] supersede_prior_config_draft failed:', r.error.message); return false; }
  return true;
}
// §OPTION-3-v3 #7 race-safe post-delete certification: revalidate fence/expected-draft/intent/orphan
// atomically and return whether the prior config is SAFE_FOR_BENEFIT_TAKEOVER. false → no benefit.
export async function certifyPriorConfigSuperseded(svc: any, priorConfigId: string, expectedDraftId: string): Promise<boolean> {
  const r = await svc.rpc('certify_prior_config_superseded', { p_prior_config_id: priorConfigId, p_expected_draft_id: expectedDraftId });
  if (r.error) { console.error('[checkout] certify_prior_config_superseded failed:', r.error.message); return false; }
  return r.data === true;
}
// §OPTION-3-v4 #1 PRE-DELETE takeover fence (0030). Atomically decide, BEFORE any external delete,
// whether the prior config's benefit may be taken: a LIVE prior lease → 'blocked' (do NOT delete);
// an expired lease → install a fence token (so the old worker's renew immediately fails) and report
// the known draft id to delete. decision ∈ 'blocked' | 'fenced_safe' | 'fenced_delete'.
export type FenceDecision =
  | { decision: 'blocked' }
  | { decision: 'fenced_safe' }
  | { decision: 'fenced_delete'; draftId: string };
export async function fencePriorConfigForTakeover(svc: any, priorConfigId: string, fenceToken: string): Promise<FenceDecision> {
  const r = await svc.rpc('fence_prior_config_for_takeover', { p_prior_config_id: priorConfigId, p_fence_token: fenceToken, p_lease_ttl_seconds: 120 });
  if (r.error) { console.error('[checkout] fence_prior_config_for_takeover failed — failing closed:', r.error.message); return { decision: 'blocked' }; }
  const row = (r.data as any)?.[0];
  const decision = row?.decision as string;
  if (decision === 'fenced_delete') {
    const id = typeof row?.draft_id === 'string' ? row.draft_id.trim() : '';
    if (!id) return { decision: 'blocked' };   // fenced_delete with no id is incoherent → fail closed
    return { decision: 'fenced_delete', draftId: id };
  }
  if (decision === 'fenced_safe') return { decision: 'fenced_safe' };
  return { decision: 'blocked' };
}
// §OPTION-3-v4 #1 FENCE-AWARE post-delete certification (0031). Recognizes OUR OWN fence token as
// "ours" instead of rejecting it as a competing live lease; certifies + supersedes both references.
export async function certifyPriorConfigFenced(svc: any, priorConfigId: string, fenceToken: string, expectedDraftId: string): Promise<boolean> {
  const r = await svc.rpc('certify_prior_config_fenced', { p_prior_config_id: priorConfigId, p_fence_token: fenceToken, p_expected_draft_id: expectedDraftId });
  if (r.error) { console.error('[checkout] certify_prior_config_fenced failed:', r.error.message); return false; }
  return r.data === true;
}
// §OPTION-3-v2 #3/#5 ownership-gated atomic persist of shopify_cart_id + intent draft (one txn).
export async function persistConfigDraftOwned(configId: string, token: string, draftId: string): Promise<boolean> {
  const svc = createSupabaseServiceClient();
  if (!svc) return true;
  const { data, error } = await svc.rpc('persist_config_draft_owned', { p_config_id: configId, p_token: token, p_draft_id: draftId });
  if (error) { console.error('[checkout] persist_config_draft_owned failed — failing closed:', (error as any)?.message); return false; }
  return data === true;
}
export async function resolveConfigIntentOwned(configId: string, token: string): Promise<boolean> {
  const svc = createSupabaseServiceClient();
  if (!svc) return true;
  const { data, error } = await svc.rpc('resolve_config_intent_owned', { p_config_id: configId, p_token: token });
  if (error) { console.error('[checkout] resolve_config_intent_owned failed:', (error as any)?.message); return false; }
  return data === true;
}
// §OPTION-3-v2 #2 stable sample idempotency: same key → same sample_orders row.
export type SampleSubject = { id: string; isNew: boolean; paymentState: string; draftId: string | null; invoiceUrl: string | null; amountCents: number; creditCents: number; currency: string } | null;
export async function getOrCreateSampleOrder(svc: any, args: {
  idempotencyKey: string; authUserId: string | null; customerId: string | null; email: string | null;
  locale: string; amountCents: number; creditCents: number;
}): Promise<SampleSubject> {
  const r = await svc.rpc('get_or_create_sample_order', {
    p_idempotency_key: args.idempotencyKey, p_auth_user_id: args.authUserId, p_customer_id: args.customerId,
    p_email: args.email, p_locale: args.locale, p_amount_cents: args.amountCents, p_credit_cents: args.creditCents });
  if (r.error) { console.error('[sample] get_or_create_sample_order failed:', r.error.message); return null; }
  const row = (r.data as any)?.[0];
  if (!row) return null;
  return { id: row.id, isNew: row.is_new, paymentState: row.payment_state,
    draftId: row.shopify_draft_order_id ?? null, invoiceUrl: row.shopify_invoice_url ?? null,
    amountCents: row.amount_cents, creditCents: row.credit_cents, currency: row.currency ?? 'EUR' };
}
// §DEFECT-2 persist the payable invoice URL so an idempotent retry can resume the SAME checkout.
export async function setSampleInvoice(svc: any, sampleOrderId: string, draftId: string, invoiceUrl: string): Promise<boolean> {
  const r = await svc.rpc('set_sample_invoice', { p_sample_order_id: sampleOrderId, p_draft_id: draftId, p_invoice_url: invoiceUrl });
  if (r.error) { console.error('[sample] set_sample_invoice failed:', r.error.message); return false; }
  return r.data === true;   // §OPTION-3-v4 #9 RPC proves exactly one row updated
}
// §OPTION-3-v4 #5 classify the COMBINED main recovery state so config+intent referencing the SAME
// draft is ONE deletion obligation.
export async function classifyMainDraftRecovery(svc: any, configId: string): Promise<{ draftId: string | null; bothRef: boolean; intentStatus: string | null }> {
  const r = await svc.rpc('classify_main_draft_recovery', { p_config_id: configId });
  if (r.error) { console.error('[checkout] classify_main_draft_recovery failed:', r.error.message); return { draftId: null, bothRef: false, intentStatus: null }; }
  const row = (r.data as any)?.[0];
  return { draftId: row?.draft_id ?? null, bothRef: row?.both_ref === true, intentStatus: row?.intent_status ?? null };
}
export async function supersedeMainDraftCoherent(svc: any, configId: string, draftId: string): Promise<boolean> {
  const r = await svc.rpc('supersede_main_draft_coherent', { p_config_id: configId, p_draft_id: draftId });
  if (r.error) { console.error('[checkout] supersede_main_draft_coherent failed:', r.error.message); return false; }
  return true;
}
// §OPTION-3-v4 #4 ONE owner-gated atomic transition clearing config.shopify_cart_id AND superseding
// the intent, after the single external draft is confirmed gone. Replaces the self-conflicting
// (owner-agnostic supersede) + (second expected-old-id clear) pair. false → lost ownership → fail closed.
export async function supersedeMainDraftOwned(configId: string, token: string, draftId: string | null): Promise<boolean> {
  const svc = createSupabaseServiceClient();
  if (!svc) return true;
  const { data, error } = await svc.rpc('supersede_main_draft_owned', { p_config_id: configId, p_token: token, p_draft_id: draftId });
  if (error) { console.error('[checkout] supersede_main_draft_owned failed — failing closed:', (error as any)?.message); return false; }
  return data === true;
}
// §OPTION-3-v4 #7 record draft id AND invoice URL on the intent atomically (crash-window-safe).
export async function attachIntentDraftUrl(svc: any, configOrSubjectId: string, token: string, draftId: string, invoiceUrl: string): Promise<boolean> {
  const r = await svc.rpc('attach_intent_draft_url', { p_config_id: configOrSubjectId, p_token: token, p_draft_id: draftId, p_invoice_url: invoiceUrl });
  if (r.error) { console.error('[checkout] attach_intent_draft_url failed:', r.error.message); return false; }
  return r.data === true;
}
// Recovery source when sample_orders URL was never written (process died between attach and persist).
export async function getIntentInvoiceUrl(svc: any, configOrSubjectId: string): Promise<{ draftId: string | null; invoiceUrl: string | null; status: string | null }> {
  const r = await svc.rpc('get_intent_invoice_url', { p_config_id: configOrSubjectId });
  if (r.error) { console.error('[checkout] get_intent_invoice_url failed:', r.error.message); return { draftId: null, invoiceUrl: null, status: null }; }
  const row = (r.data as any)?.[0];
  return { draftId: row?.shopify_draft_order_id ?? null, invoiceUrl: row?.invoice_url ?? null, status: row?.status ?? null };
}
// §OPTION-3-v4 #3A owner-gated prior-draft clear with expected-id matching.
export async function clearConfigDraftOwned(configId: string, token: string, expectedDraftId: string | null): Promise<boolean> {
  const svc = createSupabaseServiceClient();
  if (!svc) return true;
  const { data, error } = await svc.rpc('clear_config_draft_owned', { p_config_id: configId, p_token: token, p_expected_draft_id: expectedDraftId });
  if (error) { console.error('[checkout] clear_config_draft_owned failed:', (error as any)?.message); return false; }
  return data === true;
}
// §OPTION-3-v4 #3B owner-gated checkout snapshot persist.
export async function persistConfigSnapshotOwned(configId: string, token: string, status: string, snapshot: unknown): Promise<boolean> {
  const svc = createSupabaseServiceClient();
  if (!svc) return true;
  const { data, error } = await svc.rpc('persist_config_snapshot_owned', { p_config_id: configId, p_token: token, p_status: status, p_snapshot: snapshot });
  if (error) { console.error('[checkout] persist_config_snapshot_owned failed:', (error as any)?.message); return false; }
  return data === true;
}
// §OPTION-3-v4 #3 owner-gated persist of the COMPLETE CANONICAL finalize checkout state (pricing
// breakdown + benefit + free-sample flags + auth identity + artwork) in ONE statement gated on the
// current lease token — replacing the token-UNGATED upsertConfiguration finalize write. A stale
// worker (lease reclaimed) matches zero rows → false. This must persist EVERYTHING the removed
// finalize upsert wrote so admin/webhook never see stale pre-finalize pricing or lose artwork.
// Artwork paths (front/back): undefined → omit (leave unchanged); null → explicit "no upload for this
// side" (clears the column); a string → store that path. `supporting`: undefined → omit; an array →
// replace (pass [] to explicitly clear). Both map the app-level tri-state onto the RPC sentinels.
export async function persistConfigCheckoutOwned(args: {
  configId: string; token: string; status: string;
  basePriceCents: number; surchargeCents: number; totalPriceCents: number; unitRateCents: number;
  preBenefitTotalCents: number; savingsCents: number;
  benefitType: string | null; benefitAmountCents: number; sampleOrderId: string | null;
  freeSampleSet: boolean; freeSampleSource: string | null; authUserId: string | null;
  frontPath?: string | null; backPath?: string | null;
  supporting?: { field: string; path: string }[]; snapshot?: unknown;
}): Promise<boolean> {
  const svc = createSupabaseServiceClient();
  if (!svc) return true;
  const pathArg = (v: string | null | undefined): string | null => v === undefined ? null : (v === null ? '' : v);
  const { data, error } = await svc.rpc('persist_config_checkout_owned', {
    p_config_id: args.configId, p_token: args.token, p_status: args.status,
    p_base_price_cents: args.basePriceCents, p_surcharge_cents: args.surchargeCents,
    p_total_price_cents: args.totalPriceCents, p_unit_rate_cents: args.unitRateCents,
    p_pre_benefit_total_cents: args.preBenefitTotalCents, p_savings_cents: args.savingsCents,
    p_benefit_type: args.benefitType, p_benefit_amount_cents: args.benefitAmountCents,
    p_sample_order_id: args.sampleOrderId,
    p_free_sample_set: args.freeSampleSet, p_free_sample_source: args.freeSampleSource,
    p_auth_user_id: args.authUserId,
    p_front_path: pathArg(args.frontPath), p_back_path: pathArg(args.backPath),
    p_supporting: args.supporting === undefined ? null : args.supporting,
    p_snapshot: args.snapshot ?? null,
  });
  if (error) { console.error('[checkout] persist_config_checkout_owned failed — failing closed:', (error as any)?.message); return false; }
  return data === true;
}
// §OPTION-3-v4 #2 pre-create benefit revalidation: prove the benefit still belongs to THIS config.
// The caller passes the AUTH user id; revalidate_benefit_owned matches first_order_claims.customer_id
// = customers.id (NOT auth.users.id), so we resolve customers.id here — exactly as reserve/release do
// — before the RPC. Passing the raw auth id would match no claim and spuriously fail closed.
export async function revalidateBenefitOwned(args: { benefitType: string | null; configId: string; authUserId: string | null; sampleOrderId: string | null }): Promise<boolean> {
  if (!args.benefitType) return true;   // no discount to protect
  const svc = createSupabaseServiceClient();
  if (!svc) return true;
  let customerId: string | null = null;
  if (args.benefitType === 'first_order_5pct') {
    // first_order requires the real customers.id; without it there is nothing to revalidate → fail closed.
    if (!args.authUserId) { console.error('[checkout] revalidate_benefit_owned: no auth user for first_order — failing closed'); return false; }
    const { data: cust, error: cErr } = await svc.from('customers').select('id').eq('auth_user_id', args.authUserId).maybeSingle();
    if (cErr) { console.error('[checkout] revalidate_benefit_owned: customer lookup failed — failing closed:', (cErr as any)?.message); return false; }
    if (!cust) { console.error('[checkout] revalidate_benefit_owned: no customer row for auth user — failing closed'); return false; }
    customerId = cust.id;
  }
  const { data, error } = await svc.rpc('revalidate_benefit_owned', {
    p_benefit_type: args.benefitType, p_config_id: args.configId,
    p_customer_id: customerId, p_sample_order_id: args.sampleOrderId });
  if (error) { console.error('[checkout] revalidate_benefit_owned failed — failing closed:', (error as any)?.message); return false; }
  return data === true;
}

// §P0-2 If a benefit is currently reserved by a DIFFERENT, EXPIRED configuration, that
// configuration's stale Shopify draft MUST be deleted BEFORE we take the benefit over — so an
// old discounted invoice can never remain payable in parallel with a new one (the double-spend
// the brief warns about). Returns TRUE only when it is safe to proceed: either there is no
// blocking stale draft, or one existed and Shopify CONFIRMED its deletion. Returns FALSE when a
// stale payable draft exists but could not be confirmed deleted → the caller must FAIL CLOSED
// (grant no benefit) rather than create a second discounted invoice.
// §OPTION-3-v2 #1 Prove a PRIOR configuration carries no unresolved payment risk before a stale
// benefit reservation may move to a new config. Checks ALL authoritative surfaces atomically
// (configurations.shopify_cart_id + checkout_intents + open checkout_orphan_drafts), not just
// shopify_cart_id. Returns true ONLY when: no risk (safe), OR a known prior draft that we then
// CONFIRM-DELETE and durably transition to superseded. Any block/unknown/error → false (fail closed).
async function priorConfigProvenSafe(svc: any, priorConfigId: string): Promise<boolean> {
  // §OPTION-3-v4 #1 PRE-DELETE FENCE. Before touching any external Shopify draft, atomically fence
  // the prior config: a LIVE prior lease MUST block the takeover BEFORE deletion (never delete a
  // draft a concurrent worker may be paying against); an EXPIRED lease is fenced BEFORE deletion by
  // installing a fence token, so the old worker's renew immediately fails and no fresh normal
  // checkout can start on the prior config while we take its benefit over.
  const fenceToken = randomUUID();
  const fence = await fencePriorConfigForTakeover(svc, priorConfigId, fenceToken);
  if (fence.decision === 'blocked') return false;          // live lease / uncertainty → fail closed
  if (fence.decision === 'fenced_safe') {
    // Fenced, no known external draft to delete → certify directly. The certifier recognizes OUR
    // fence token (not a competing live lease) and supersedes both references.
    return await certifyPriorConfigFenced(svc, priorConfigId, fenceToken, '');
  }
  // fenced_delete: a known payable (possibly discounted) draft exists. Delete-confirm the SINGLE
  // external draft (network call, OUTSIDE any DB txn) AFTER the fence is installed, then certify.
  const deleted = await deleteDraftOrder(fence.draftId);
  if (!deleted) return false;                              // deletion unconfirmed → fail closed
  // Post-delete certification MUST recognize/verify our expected fence token so the old 0029
  // live-lease check does not reject our own freshly-installed fence.
  return await certifyPriorConfigFenced(svc, priorConfigId, fenceToken, fence.draftId);
}

async function invalidateStaleDraftForSampleCredit(svc: any, sampleOrderId: string, configId: string): Promise<boolean> {
  const read = await svc.from('sample_orders')
    .select('credit_reserved_config_id, credit_reservation_expires_at').eq('id', sampleOrderId).maybeSingle();
  // §P0-4 every read is checked; any error → cannot prove safe → fail closed (grant no benefit).
  const dec = staleReservationDecision({
    read: { data: read.data ? { reserved_config_id: read.data.credit_reserved_config_id, reservation_expires_at: read.data.credit_reservation_expires_at } : null, error: read.error },
    currentConfigId: configId, nowMs: Date.now(),
  });
  if (!dec.ok) return false;
  if (!dec.priorConfigId) return true;                     // nothing stale blocking us
  // §OPTION-3-v2 #1 inspect ALL payment-risk surfaces of the prior config, not just shopify_cart_id.
  return await priorConfigProvenSafe(svc, dec.priorConfigId);
}
async function invalidateStaleDraftForFirstOrder(svc: any, customerId: string, configId: string): Promise<boolean> {
  const read = await svc.from('first_order_claims')
    .select('config_id, expires_at, state').eq('customer_id', customerId).maybeSingle();
  if (read.error) return false;                            // §P0-4 fail closed
  const claim = read.data;
  const dec = staleReservationDecision({
    read: { data: claim ? { reserved_config_id: claim.config_id, reservation_expires_at: claim.expires_at } : null, error: null },
    currentConfigId: configId, nowMs: Date.now(),
  });
  if (!dec.ok) return false;
  if (!dec.priorConfigId || claim?.state !== 'reserved') return true;
  // §OPTION-3-v2 #1 inspect ALL payment-risk surfaces of the prior config, not just shopify_cart_id.
  return await priorConfigProvenSafe(svc, dec.priorConfigId);
}

export async function reserveBenefitForCheckout(priced: PricedOk, configId: string): Promise<HeldBenefit> {
  const dropped: HeldBenefit = { benefitType: null, benefitAmountCents: 0, sampleOrderId: null };
  if (!priced.benefitType) return dropped;
  const svc = createSupabaseServiceClient();
  if (!svc) return dropped;

  if (priced.benefitType === 'sample_credit' && priced.sampleOrderId) {
    // §P0-2 FAIL CLOSED: if an old discounted draft for this credit can't be confirmed deleted,
    // do NOT reserve — the customer pays the full pre-benefit price instead of double-spending.
    const safe = await invalidateStaleDraftForSampleCredit(svc, priced.sampleOrderId, configId);
    if (!safe) return dropped;
    const { data, error } = await svc.rpc('reserve_sample_credit',
      { p_sample_order_id: priced.sampleOrderId, p_config_id: configId, p_ttl_minutes: RESERVE_TTL_MINUTES });
    if (error || data !== true) return dropped;
    return { benefitType: 'sample_credit', benefitAmountCents: priced.benefitAmountCents, sampleOrderId: priced.sampleOrderId };
  }

  if (priced.benefitType === 'first_order_5pct' && priced.authUserId) {
    const { data: cust } = await svc.from('customers').select('id').eq('auth_user_id', priced.authUserId).maybeSingle();
    if (!cust) return dropped;
    // §P0-2 FAIL CLOSED (same rule as the sample credit above).
    const safe = await invalidateStaleDraftForFirstOrder(svc, cust.id, configId);
    if (!safe) return dropped;
    const { data, error } = await svc.rpc('reserve_first_order',
      { p_customer_id: cust.id, p_config_id: configId, p_ttl_minutes: RESERVE_TTL_MINUTES });
    if (error || data !== true) return dropped;
    return { benefitType: 'first_order_5pct', benefitAmountCents: priced.benefitAmountCents, sampleOrderId: null };
  }
  return dropped;
}

// §P0-1 OWNERSHIP-GATED release of a reservation held by this configuration (checkout aborted /
// total mismatch). `leaseToken` is the checkout lease token the caller acquired; the release RPCs
// (migration 0023) clear the reservation ONLY when this token still matches the configuration's
// current lease owner — so a STALE request that has lost the lease can never release the
// reservation the CURRENT owner is using. A stale caller is a safe no-op; the reservation stays
// with the current owner or expires by its own TTL. Best-effort otherwise.
export async function releaseHeldBenefit(held: HeldBenefit, configId: string, authUserId: string | null, leaseToken: string): Promise<void> {
  if (!held.benefitType) return;
  const svc = createSupabaseServiceClient();
  if (!svc || leaseToken === DEV_LEASE_TOKEN) return;   // dev/unconfigured: single process, no store
  try {
    if (held.benefitType === 'sample_credit' && held.sampleOrderId) {
      await svc.rpc('release_sample_credit_if_owner', { p_sample_order_id: held.sampleOrderId, p_config_id: configId, p_token: leaseToken });
    } else if (held.benefitType === 'first_order_5pct' && authUserId) {
      const { data: cust } = await svc.from('customers').select('id').eq('auth_user_id', authUserId).maybeSingle();
      if (cust) await svc.rpc('release_first_order_if_owner', { p_customer_id: cust.id, p_config_id: configId, p_token: leaseToken });
    }
  } catch { /* best-effort */ }
}
