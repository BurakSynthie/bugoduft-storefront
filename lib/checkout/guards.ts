// ============================================================================
// FAIL-CLOSED CHECKOUT / BENEFIT GUARDS  (pure, dependency-free, unit-testable)
// ----------------------------------------------------------------------------
// This module encodes the payment-safety invariants from the final repair pass as
// pure decision functions. They take the RAW Supabase result shape ({ data, error })
// and never touch the network, so they can be exhaustively unit-tested — AND they are
// the SAME functions the production repositories call, so the tests are not testing
// mocks in a vacuum: they test the exact predicates that gate real money movement.
//
// The single rule they all enforce:  UNKNOWN STATE = FAILURE.
//   A database error must NEVER be read as: no old draft / benefit available / eligible.
// ============================================================================

// Minimal shape of a supabase-js single-row read. `error` truthy = the query failed.
export type DbRead<T> = { data: T | null; error: unknown };
// Minimal shape of a supabase-js `count` (head) read.
export type DbCount = { count: number | null; error: unknown };

// ---- §P0-2  EXISTING DRAFT LOOKUP ------------------------------------------------------------
// The Shopify draft currently attached to a configuration. A DB error must NOT be collapsed to
// "no draft" (which would let checkout create a SECOND payable draft). Distinguish three states:
//   { ok:false }                     -> query errored: caller MUST fail closed, create nothing.
//   { ok:true, draftId:null }        -> row read successfully, genuinely has no draft.
//   { ok:true, draftId:'gid://...' } -> row read successfully, has an existing draft.
export type DraftLookup = { ok: true; draftId: string | null } | { ok: false };
export function resolveDraftLookup(r: DbRead<{ shopify_cart_id?: string | null }>): DraftLookup {
  if (r.error) return { ok: false };
  return { ok: true, draftId: r.data?.shopify_cart_id ?? null };
}

// ---- §HIGH-8  FIRST-ORDER (5%) ELIGIBILITY ---------------------------------------------------
// A database failure must NEVER accidentally grant the 5% first-order benefit. Every ambiguous
// signal fails closed to "not eligible":
//   • paid-order count query errors           -> not eligible (never treat error as 0 orders)
//   • paid-order count is null (unknown)       -> not eligible (never treat null as 0 orders)
//   • customer already has >=1 paid main order -> not eligible
//   • first_order_claims lookup errors         -> not eligible (ambiguous ≠ "unused")
//   • an existing claim is 'consumed'          -> not eligible
//   • authoritative settings could not load    -> not eligible (see settingsLoaded)
export function firstOrderEligible(args: {
  settingsLoaded: boolean;              // false when site_settings could not be read authoritatively
  firstOrderEnabled: boolean;
  firstOrderPercent: number;
  count: DbCount;                       // paid main orders for this customer
  claim: DbRead<{ state?: string | null }>;   // existing first_order_claims row (if any)
}): boolean {
  if (!args.settingsLoaded) return false;                 // §HIGH-8 settings unknown → no benefit
  if (!args.firstOrderEnabled || args.firstOrderPercent <= 0) return false;
  if (args.count.error) return false;                     // §HIGH-8 count query error → fail closed
  if (args.count.count == null) return false;             // §HIGH-8 null ≠ zero prior orders
  if (args.count.count > 0) return false;                 // has a real paid order already
  if (args.claim.error) return false;                     // §HIGH-8 claim lookup error → fail closed
  if (args.claim.data?.state === 'consumed') return false;
  return true;
}

// ---- §P0-4 / benefit preview  PAID-SAMPLE (€20) CREDIT ---------------------------------------
// The unredeemed paid-sample credit currently available to this user, in cents, capped at the
// order total. A DB error yields 0 (fail closed — never preview or grant a credit we can't prove
// is available). A credit reserved by a DIFFERENT, still-valid checkout also yields 0.
export function sampleCreditCents(args: {
  row: {
    credit_cents: number;
    credit_reserved_config_id?: string | null;
    credit_reservation_expires_at?: string | null;
  } | null;
  error: unknown;
  preBenefitTotalCents: number;
  nowMs: number;
}): number {
  if (args.error) return 0;                               // §P0-4 fail closed
  if (!args.row) return 0;
  const reservedElsewhere =
    !!args.row.credit_reserved_config_id &&
    !!args.row.credit_reservation_expires_at &&
    new Date(args.row.credit_reservation_expires_at).getTime() > args.nowMs;
  if (reservedElsewhere) return 0;
  if (!Number.isFinite(args.row.credit_cents) || args.row.credit_cents <= 0) return 0;
  return Math.min(args.row.credit_cents, Math.max(0, args.preBenefitTotalCents));
}

// ---- §P0-4  STALE DISCOUNTED-DRAFT INVALIDATION --------------------------------------------
// Before a benefit reservation currently held by a DIFFERENT, EXPIRED configuration can be taken
// over, that configuration's stale Shopify draft must be confirmed deleted — otherwise an old
// discounted invoice could stay payable in parallel with a new one (double-spend). This pure
// helper decides, from the reservation-owner read, WHETHER a prior draft must be invalidated and
// which config holds it. A DB error means "cannot prove safe" → block (caller fails closed).
export type StaleDecision =
  | { ok: false }                                         // DB error: cannot prove safe → block
  | { ok: true; priorConfigId: string | null };          // config whose stale draft must be checked (or null)
export function staleReservationDecision(args: {
  read: DbRead<{ reserved_config_id?: string | null; reservation_expires_at?: string | null }>;
  currentConfigId: string;
  nowMs: number;
}): StaleDecision {
  if (args.read.error) return { ok: false };              // §P0-4 fail closed
  const row = args.read.data;
  const prior = row?.reserved_config_id ?? null;
  const exp = row?.reservation_expires_at ? new Date(row.reservation_expires_at).getTime() : null;
  const expired = exp != null && exp < args.nowMs;
  if (prior && prior !== args.currentConfigId && expired) return { ok: true, priorConfigId: prior };
  return { ok: true, priorConfigId: null };
}

// ---- §P0-3 / §HIGH-9  ORPHAN-DRAFT CLEANUP OUTCOME -----------------------------------------
// A newly-created Shopify draft whose id could NOT be persisted must be invalidated. The benefit
// may only be released/recycled if that deletion is CONFIRMED. If deletion is NOT confirmed, a
// payable invoice of unknown status exists → the one-time benefit must stay reserved (never
// recycled) and the orphan must be recorded for reconciliation.
export type OrphanOutcome = {
  releaseBenefit: boolean;      // may we safely release/recycle the one-time benefit?
  recordOrphan: boolean;        // must we persist reconciliation state for a possibly-live draft?
  critical: boolean;            // is this the "unknown payable invoice" critical branch?
};
export function orphanCleanupOutcome(deletionConfirmed: boolean): OrphanOutcome {
  return deletionConfirmed
    ? { releaseBenefit: true, recordOrphan: false, critical: false }
    : { releaseBenefit: false, recordOrphan: true, critical: true };
}

// ---- §P0-6  CHECKOUT LEASE CLAIM RESULT ----------------------------------------------------
// Interpret the RPC result of claim_config_checkout. A missing RPC (migration not applied),
// a DB error, or an absent token all FAIL CLOSED — checkout must not proceed without the
// concurrency guard. Only a real token means "proceed".
export type LeaseClaim =
  | { ok: true; token: string }
  | { ok: false; reason: 'in_progress' | 'error' };
export function resolveLeaseClaim(args: {
  data: unknown;                 // rpc data (expected: token string, or null when held)
  error: { code?: string; message?: string } | null;
}): LeaseClaim {
  if (args.error) {
    // Function missing (PGRST202 / 42883) or any other DB error → fail closed (§P0-6).
    return { ok: false, reason: 'error' };
  }
  if (typeof args.data === 'string' && args.data.length > 0) return { ok: true, token: args.data };
  // null / false / empty → lease is held by another in-flight finalize.
  return { ok: false, reason: 'in_progress' };
}

// ---- §P0-1  DRAFT-CREATE FAILURE OUTCOME (amount/currency mismatch cleanup) -----------------
// When createBugoDraftOrder returns a failure, its optional `cleanup` says whether a draft it made
// (then rejected for amount/currency mismatch) was CONFIRMED deleted. If deletion is NOT confirmed,
// a payable invoice of unknown status remains → record the orphan and RETAIN the one-time benefit.
// Otherwise (no draft, or confirmed deleted) it is safe to release the benefit.
export type DraftFailureOutcome = { recordOrphan: boolean; retainBenefit: boolean; orphanDraftId: string | null };
// §OPTION-3-v4 #4 Map a create-certainty to the caller's safe decision. This centralizes the
// benefit-release / orphan / intent-transition policy so main and sample behave identically.
//   releaseBenefit    → only when NO payable draft can exist (definite/confirmed-deleted).
//   recordOrphan      → a known draft id remains unresolved.
//   keepIntentBlocking→ the draft MAY exist (unknown outcome) → durable intent stays blocking.
//   intentSafeReset   → no draft exists → intent may be superseded/reset for a clean retry.
export type CreateCertainty2 = 'definitely_no_draft' | 'confirmed_deleted' | 'known_draft_unresolved' | 'unknown_create_outcome';
export type CertaintyDecision = { releaseBenefit: boolean; recordOrphan: boolean; keepIntentBlocking: boolean; intentSafeReset: boolean };
export function createCertaintyDecision(certainty: CreateCertainty2): CertaintyDecision {
  switch (certainty) {
    case 'definitely_no_draft':
    case 'confirmed_deleted':
      return { releaseBenefit: true, recordOrphan: false, keepIntentBlocking: false, intentSafeReset: true };
    case 'known_draft_unresolved':
      return { releaseBenefit: false, recordOrphan: true, keepIntentBlocking: true, intentSafeReset: false };
    case 'unknown_create_outcome':
    default:
      // The draft MAY exist and we cannot see it → retain benefit, keep intent blocking, no reset.
      return { releaseBenefit: false, recordOrphan: false, keepIntentBlocking: true, intentSafeReset: false };
  }
}

export function draftCreateFailureOutcome(
  cleanup?: { attempted: boolean; confirmed: boolean; orphanDraftId?: string },
): DraftFailureOutcome {
  if (cleanup?.attempted && !cleanup.confirmed && cleanup.orphanDraftId) {
    return { recordOrphan: true, retainBenefit: true, orphanDraftId: cleanup.orphanDraftId };
  }
  return { recordOrphan: false, retainBenefit: false, orphanDraftId: null };
}

// ---- §HIGH-3  SAMPLE PURCHASE GATE (authoritative settings, fail closed) --------------------
// A paid sample checkout is a PAYMENT action: it must use authoritative settings and fail closed
// if they could not be loaded, if samples are disabled, or if the price is invalid — never fall
// back to default commercial values (samples enabled, €40/€20).
export type SampleGate = { ok: true } | { ok: false; reason: 'settings_unavailable' | 'disabled' | 'invalid_price' };
export function samplePurchaseGate(a: { loaded: boolean; enabled: boolean; priceCents: number }): SampleGate {
  if (!a.loaded) return { ok: false, reason: 'settings_unavailable' };   // §HIGH-3 DB unknown → abort
  if (!a.enabled) return { ok: false, reason: 'disabled' };
  if (!Number.isFinite(a.priceCents) || a.priceCents <= 0) return { ok: false, reason: 'invalid_price' };
  return { ok: true };
}

// ---- §HIGH-5  BENEFIT ACTION PRECEDENCE (cancelled wins over paid) --------------------------
// A single authoritative action per order. Cancelled ALWAYS wins over paid, so a paid-then-cancelled
// order never permanently consumes a one-time benefit. Exactly one branch runs downstream.
export type BenefitAction = 'consume' | 'release' | 'none';
export function benefitAction(a: { isPaid: boolean; isCancelled: boolean }): BenefitAction {
  if (a.isCancelled) return 'release';   // §HIGH-5 cancelled precedence
  if (a.isPaid) return 'consume';
  return 'none';
}
