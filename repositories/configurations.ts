import 'server-only';
import type { Locale } from '@/i18n/config';
import { listProducts } from '@/repositories/catalog';
import { validateQuantity } from '@/lib/quantity';
import { INTENSE_SURCHARGE_CENTS } from '@/config/shopify';
import { createSupabaseServiceClient } from '@/lib/supabase/server';
import { isSupabaseConfigured } from '@/lib/supabase/env';
import { SHAPES } from '@/lib/configurator/shapes';
import { priceQuantity, type PriceTier } from '@/lib/pricing/tiers';
import { getSettings } from '@/repositories/settings';
import { getCustomerUser, ensureCustomerRow } from '@/lib/customer/session';
import { deleteDraftOrder } from '@/lib/shopify/draft-order';

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
  const settings = await getSettings();

  // §P0: make sure this authenticated customer has a `customers` row BEFORE first-order
  // eligibility is evaluated — a user can register and go straight to checkout without ever
  // visiting /konto, and the 5% benefit must not be silently lost for lack of a row.
  await ensureCustomerRow(user);

  // §P0/§P1 GUEST-CREDIT LINKING: a paid sample bought as a guest has auth_user_id = null and
  // its email set by the webhook. When the purchaser later signs in with the SAME VERIFIED
  // email, attach that purchase so the €20 credit becomes findable. Gated on emailVerified
  // (never a Dashboard assumption): an unconfirmed email can't claim guest commerce. Only
  // ever touches rows whose email equals the caller's own verified session email.
  if (user.emailVerified) {
    const { data: custLink } = await svc.from('customers').select('id').eq('auth_user_id', user.id).maybeSingle();
    await svc.from('sample_orders')
      .update({ auth_user_id: user.id, customer_id: custLink?.id ?? null })
      .is('auth_user_id', null).eq('payment_state', 'paid').ilike('email', user.email);
  }

  // Unredeemed paid sample credit for this user (now including any just-linked guest row).
  // Excludes credits already reserved by a DIFFERENT, still-valid checkout so a second tab
  // doesn't even PREVIEW a credit another in-flight order holds (the authoritative guard is
  // the atomic reserve at finalize; this just keeps the preview honest).
  const { data: sampleRow } = await svc.from('sample_orders')
    .select('id, credit_cents, credit_reserved_config_id, credit_reservation_expires_at')
    .eq('auth_user_id', user.id).eq('payment_state', 'paid').is('credit_used_at', null)
    .order('created_at', { ascending: true }).limit(1).maybeSingle();
  const reservedElsewhere = !!sampleRow?.credit_reserved_config_id
    && !!sampleRow?.credit_reservation_expires_at
    && new Date(sampleRow.credit_reservation_expires_at).getTime() > Date.now();
  const creditCents = sampleRow && !reservedElsewhere ? Math.min(sampleRow.credit_cents, preBenefitTotalCents) : 0;

  // §P0-4 FIRST-ORDER ELIGIBILITY: based on REAL paid main-order history only. An
  // abandoned/unpaid/cancelled order never permanently consumes the benefit. A 'consumed'
  // claim (set on confirmed payment) also blocks re-grant during the window before the
  // order row lands. Percentage + on/off are admin-managed (§P1).
  let fivePctCents = 0;
  const fo = settings.commerce.firstOrder;
  const { data: cust } = await svc.from('customers').select('id').eq('auth_user_id', user.id).maybeSingle();
  if (cust && fo.enabled && fo.percent > 0) {
    const { count } = await svc.from('orders').select('id', { count: 'exact', head: true })
      .eq('customer_id', cust.id).eq('order_kind', 'main').eq('payment_state', 'paid');
    let eligible = !count;
    if (eligible) {
      const { data: claim } = await svc.from('first_order_claims').select('state').eq('customer_id', cust.id).maybeSingle();
      if (claim?.state === 'consumed') eligible = false;
    }
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
  if (validateQuantity(c.quantity, { min: src.minQty, max: src.maxQty, step: src.qtyStep })) return { ok:false, error:'invalid_quantity' };
  if (!c.scentCode || !src.scentCodes.includes(c.scentCode)) return { ok:false, error:'invalid_scent' };
  if (c.scentCode2) {
    if (!src.scentCodes.includes(c.scentCode2)) return { ok:false, error:'invalid_scent2' };
    if (c.scentCode2 === c.scentCode) return { ok:false, error:'duplicate_scent' };
  }
  if (!SHAPE_IDS.has(c.shape as any)) return { ok:false, error:'invalid_shape' };
  if (c.intensity !== 'normal' && c.intensity !== 'intense') return { ok:false, error:'invalid_intensity' };

  const q = priceQuantity(src.tiers, c.quantity);
  const surchargeCents = c.intensity === 'intense' ? src.intenseSurchargeCents : 0;
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
export async function upsertConfiguration(input: PersistInput): Promise<{ ok:true } | { ok:false; message:string }> {
  if (!isSupabaseConfigured()) return { ok:false, message:'Supabase ist nicht konfiguriert.' };
  const c = createSupabaseServiceClient();
  if (!c) return { ok:false, message:'Supabase ist nicht konfiguriert.' };
  if (!('productCode' in input) || !input.ok) return { ok:false, message:'invalid_config' };
  // Map the stable catalog product_code (e.g. BUGO-STD) to the real products.id UUID.
  const { data: prod, error: lookupErr } = await c.from('products').select('id').eq('product_code', input.productCode).maybeSingle();
  if (lookupErr) return { ok:false, message: lookupErr.message };
  if (!prod) console.warn('[configurations] no products row for product_code', input.productCode, '- storing null product_id');
  const row = {
    id: input.configId, locale: input.locale, product_id: prod?.id ?? null, collection_code: input.collectionCode,
    quantity: input.quantity, scent_code: input.scentCode, scent_code_2: input.scentCode2 ?? null, intensity: input.intensity, shape: input.shape,
    front_path: input.frontPath ?? null, front_instructions: input.frontInstructions,
    same_back_as_front: input.sameBackAsFront, back_path: input.backPath ?? null,
    back_instructions: input.sameBackAsFront ? null : input.backInstructions,
    supporting: input.supporting ?? [],
    base_price_cents: input.basePriceCents, surcharge_cents: input.surchargeCents, total_price_cents: input.totalPriceCents,
    unit_rate_cents: (input as any).unitRateCents ?? null,
    free_sample_set: (input as any).freeSampleSet ?? false,
    free_sample_source: (input as any).freeSampleSource ?? null,
    design_mode: input.designMode ?? 'bugo_creates',
    status: input.status ?? 'draft', shopify_cart_id: input.shopifyCartId ?? null,
    savings_cents: (input as any).savingsCents ?? 0,
    pre_benefit_total_cents: (input as any).preBenefitTotalCents ?? null,
    benefit_type: (input as any).benefitType ?? null,
    benefit_amount_cents: (input as any).benefitAmountCents ?? 0,
    sample_order_id: (input as any).sampleOrderId ?? null,
    auth_user_id: (input as any).authUserId ?? null,
  };
  const { error } = await c.from('configurations').upsert(row, { onConflict: 'id' });
  if (error) return { ok:false, message: error.message };
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

// The Shopify draft (invoice) currently attached to a configuration, if any.
export async function getExistingDraftId(configId: string): Promise<string | null> {
  const svc = createSupabaseServiceClient();
  if (!svc) return null;
  const { data } = await svc.from('configurations').select('shopify_cart_id').eq('id', configId).maybeSingle();
  return (data as any)?.shopify_cart_id ?? null;
}

// If a benefit is currently reserved by a DIFFERENT, EXPIRED configuration, delete that
// configuration's stale Shopify draft BEFORE we take the benefit over — so an old
// discounted invoice can never remain payable in parallel with a new one (the double-spend
// the brief warns about). Runs exactly at reuse time, the only moment the race can occur.
async function invalidateStaleDraftForSampleCredit(svc: any, sampleOrderId: string, configId: string): Promise<void> {
  const { data: srow } = await svc.from('sample_orders')
    .select('credit_reserved_config_id, credit_reservation_expires_at').eq('id', sampleOrderId).maybeSingle();
  const prior = srow?.credit_reserved_config_id;
  const expired = srow?.credit_reservation_expires_at && new Date(srow.credit_reservation_expires_at).getTime() < Date.now();
  if (prior && prior !== configId && expired) {
    const { data: pc } = await svc.from('configurations').select('shopify_cart_id').eq('id', prior).maybeSingle();
    if (pc?.shopify_cart_id) await deleteDraftOrder(pc.shopify_cart_id);
  }
}
async function invalidateStaleDraftForFirstOrder(svc: any, customerId: string, configId: string): Promise<void> {
  const { data: claim } = await svc.from('first_order_claims')
    .select('config_id, expires_at, state').eq('customer_id', customerId).maybeSingle();
  const expired = claim?.expires_at && new Date(claim.expires_at).getTime() < Date.now();
  if (claim?.state === 'reserved' && claim.config_id && claim.config_id !== configId && expired) {
    const { data: pc } = await svc.from('configurations').select('shopify_cart_id').eq('id', claim.config_id).maybeSingle();
    if (pc?.shopify_cart_id) await deleteDraftOrder(pc.shopify_cart_id);
  }
}

export async function reserveBenefitForCheckout(priced: PricedOk, configId: string): Promise<HeldBenefit> {
  const dropped: HeldBenefit = { benefitType: null, benefitAmountCents: 0, sampleOrderId: null };
  if (!priced.benefitType) return dropped;
  const svc = createSupabaseServiceClient();
  if (!svc) return dropped;

  if (priced.benefitType === 'sample_credit' && priced.sampleOrderId) {
    await invalidateStaleDraftForSampleCredit(svc, priced.sampleOrderId, configId);
    const { data, error } = await svc.rpc('reserve_sample_credit',
      { p_sample_order_id: priced.sampleOrderId, p_config_id: configId, p_ttl_minutes: RESERVE_TTL_MINUTES });
    if (error || data !== true) return dropped;
    return { benefitType: 'sample_credit', benefitAmountCents: priced.benefitAmountCents, sampleOrderId: priced.sampleOrderId };
  }

  if (priced.benefitType === 'first_order_5pct' && priced.authUserId) {
    const { data: cust } = await svc.from('customers').select('id').eq('auth_user_id', priced.authUserId).maybeSingle();
    if (!cust) return dropped;
    await invalidateStaleDraftForFirstOrder(svc, cust.id, configId);
    const { data, error } = await svc.rpc('reserve_first_order',
      { p_customer_id: cust.id, p_config_id: configId, p_ttl_minutes: RESERVE_TTL_MINUTES });
    if (error || data !== true) return dropped;
    return { benefitType: 'first_order_5pct', benefitAmountCents: priced.benefitAmountCents, sampleOrderId: null };
  }
  return dropped;
}

// Release a reservation held by this configuration (checkout aborted / total mismatch).
// Best-effort; expired reservations also free themselves via the RPC WHERE clauses.
export async function releaseHeldBenefit(held: HeldBenefit, configId: string, authUserId: string | null): Promise<void> {
  if (!held.benefitType) return;
  const svc = createSupabaseServiceClient();
  if (!svc) return;
  try {
    if (held.benefitType === 'sample_credit' && held.sampleOrderId) {
      await svc.rpc('release_sample_credit', { p_sample_order_id: held.sampleOrderId, p_config_id: configId });
    } else if (held.benefitType === 'first_order_5pct' && authUserId) {
      const { data: cust } = await svc.from('customers').select('id').eq('auth_user_id', authUserId).maybeSingle();
      if (cust) await svc.rpc('release_first_order', { p_customer_id: cust.id, p_config_id: configId });
    }
  } catch { /* best-effort */ }
}
