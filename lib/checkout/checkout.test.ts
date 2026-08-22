// §FINAL-REPAIR — executable regression tests for the FAIL-CLOSED checkout/benefit guards.
// PURE — never imported by production code at runtime. These test the EXACT predicates that
// repositories/configurations.ts + app/actions/checkout.ts + repositories/samples.ts use to gate
// real money movement (they import the same functions), so they are not "testing mocks".
//
// Run with:  PATH=/home/claude/.npm-global/bin:$PATH tsx lib/checkout/checkout.test.ts
import {
  resolveDraftLookup, firstOrderEligible, sampleCreditCents,
  staleReservationDecision, orphanCleanupOutcome, resolveLeaseClaim,
  draftCreateFailureOutcome, samplePurchaseGate, benefitAction,
} from './guards';

let failures = 0;
function expect(label: string, got: unknown, want: unknown) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) failures++;
  // eslint-disable-next-line no-console
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}: got ${JSON.stringify(got)} want ${JSON.stringify(want)}`);
}
const ERR = new Error('db down');

// =============================================================================================
// §P0-2  EXISTING DRAFT LOOKUP — a DB error must NOT become "no draft" (item 2).
// =============================================================================================
expect('2a lookup DB error → { ok:false } (abort, create nothing)',
  resolveDraftLookup({ data: null, error: ERR }), { ok: false });
expect('2b lookup ok, no draft → { ok:true, draftId:null }',
  resolveDraftLookup({ data: { shopify_cart_id: null }, error: null }), { ok: true, draftId: null });
expect('2c lookup ok, existing draft → { ok:true, draftId }',
  resolveDraftLookup({ data: { shopify_cart_id: 'gid://shopify/DraftOrder/1' }, error: null }),
  { ok: true, draftId: 'gid://shopify/DraftOrder/1' });
expect('2d lookup ok, row missing → { ok:true, draftId:null }',
  resolveDraftLookup({ data: null, error: null }), { ok: true, draftId: null });

// =============================================================================================
// §HIGH-8  FIRST-ORDER (5%) ELIGIBILITY — a DB failure must NEVER grant the discount (item 11).
// =============================================================================================
const okBase = {
  settingsLoaded: true, firstOrderEnabled: true, firstOrderPercent: 5,
  count: { count: 0, error: null }, claim: { data: null, error: null },
};
expect('11a happy path (0 orders, no claim) → eligible', firstOrderEligible(okBase), true);
expect('11b orders COUNT query error → NOT eligible',
  firstOrderEligible({ ...okBase, count: { count: null, error: ERR } }), false);
expect('11c orders count is null (unknown) → NOT eligible (never treat null as 0)',
  firstOrderEligible({ ...okBase, count: { count: null, error: null } }), false);
expect('11d has a prior paid order → NOT eligible',
  firstOrderEligible({ ...okBase, count: { count: 1, error: null } }), false);
expect('11e first_order_claims lookup error → NOT eligible',
  firstOrderEligible({ ...okBase, claim: { data: null, error: ERR } }), false);
expect('11f existing consumed claim → NOT eligible',
  firstOrderEligible({ ...okBase, claim: { data: { state: 'consumed' }, error: null } }), false);
expect('11g settings could not load → NOT eligible (no silent default-on)',
  firstOrderEligible({ ...okBase, settingsLoaded: false }), false);
expect('11h benefit disabled in settings → NOT eligible',
  firstOrderEligible({ ...okBase, firstOrderEnabled: false }), false);
expect('11i percent 0 → NOT eligible', firstOrderEligible({ ...okBase, firstOrderPercent: 0 }), false);

// =============================================================================================
// §P0-4  PAID-SAMPLE CREDIT — a DB error yields 0 credit (item 10); reserved-elsewhere yields 0.
// =============================================================================================
const NOW = 1_000_000;
expect('10a sample lookup DB error → 0 credit',
  sampleCreditCents({ row: null, error: ERR, preBenefitTotalCents: 10000, nowMs: NOW }), 0);
expect('10b no sample row → 0 credit',
  sampleCreditCents({ row: null, error: null, preBenefitTotalCents: 10000, nowMs: NOW }), 0);
expect('10c available credit capped at order total',
  sampleCreditCents({ row: { credit_cents: 2000 }, error: null, preBenefitTotalCents: 10000, nowMs: NOW }), 2000);
expect('10d credit larger than total is capped to total',
  sampleCreditCents({ row: { credit_cents: 20000 }, error: null, preBenefitTotalCents: 10000, nowMs: NOW }), 10000);
expect('10e credit reserved by a still-valid OTHER checkout → 0',
  sampleCreditCents({ row: { credit_cents: 2000, credit_reserved_config_id: 'other', credit_reservation_expires_at: new Date(NOW + 60000).toISOString() }, error: null, preBenefitTotalCents: 10000, nowMs: NOW }), 0);
expect('10f credit whose reservation EXPIRED is available again',
  sampleCreditCents({ row: { credit_cents: 2000, credit_reserved_config_id: 'other', credit_reservation_expires_at: new Date(NOW - 60000).toISOString() }, error: null, preBenefitTotalCents: 10000, nowMs: NOW }), 2000);

// =============================================================================================
// §P0-4  STALE DISCOUNTED-DRAFT INVALIDATION — DB error blocks (cannot prove safe) (item 12).
// =============================================================================================
expect('12a reservation-owner read error → { ok:false } (block, no benefit)',
  staleReservationDecision({ read: { data: null, error: ERR }, currentConfigId: 'me', nowMs: NOW }), { ok: false });
expect('12b no prior reservation → ok, nothing to invalidate',
  staleReservationDecision({ read: { data: { reserved_config_id: null, reservation_expires_at: null }, error: null }, currentConfigId: 'me', nowMs: NOW }),
  { ok: true, priorConfigId: null });
expect('12c prior EXPIRED reservation by another config → must invalidate its draft',
  staleReservationDecision({ read: { data: { reserved_config_id: 'old', reservation_expires_at: new Date(NOW - 1000).toISOString() }, error: null }, currentConfigId: 'me', nowMs: NOW }),
  { ok: true, priorConfigId: 'old' });
expect('12d prior STILL-VALID reservation by another config → not stale (not our turn)',
  staleReservationDecision({ read: { data: { reserved_config_id: 'old', reservation_expires_at: new Date(NOW + 60000).toISOString() }, error: null }, currentConfigId: 'me', nowMs: NOW }),
  { ok: true, priorConfigId: null });
expect('12e reservation held by OUR OWN config → nothing to invalidate',
  staleReservationDecision({ read: { data: { reserved_config_id: 'me', reservation_expires_at: new Date(NOW - 1000).toISOString() }, error: null }, currentConfigId: 'me', nowMs: NOW }),
  { ok: true, priorConfigId: null });

// =============================================================================================
// §P0-3 / §HIGH-9  ORPHAN CLEANUP OUTCOME (items 4, 5, 13, 15).
//   deletion CONFIRMED   → release benefit, no orphan record.
//   deletion UNCONFIRMED → DO NOT release benefit; record reconciliation (critical).
// =============================================================================================
expect('4/5a new-draft deletion CONFIRMED → release benefit, no orphan record',
  orphanCleanupOutcome(true), { releaseBenefit: true, recordOrphan: false, critical: false });
expect('5/13a new-draft deletion UNCONFIRMED → RETAIN benefit + record orphan (critical)',
  orphanCleanupOutcome(false), { releaseBenefit: false, recordOrphan: true, critical: true });
expect('13b benefit is NOT released while an unknown payable draft may exist',
  orphanCleanupOutcome(false).releaseBenefit, false);

// =============================================================================================
// §P0-6  CHECKOUT LEASE CLAIM — missing RPC / DB error FAIL CLOSED; held → retry (item 6).
// =============================================================================================
expect('6a real token → proceed', resolveLeaseClaim({ data: 'tok-123', error: null }), { ok: true, token: 'tok-123' });
expect('6b null (held by another finalize) → in_progress (retry)',
  resolveLeaseClaim({ data: null, error: null }), { ok: false, reason: 'in_progress' });
expect('6c missing RPC (PGRST202) → FAIL CLOSED (error, abort)',
  resolveLeaseClaim({ data: null, error: { code: 'PGRST202', message: 'function not found' } }), { ok: false, reason: 'error' });
expect('6d function absent (42883) → FAIL CLOSED',
  resolveLeaseClaim({ data: null, error: { code: '42883' } }), { ok: false, reason: 'error' });
expect('6e any DB error → FAIL CLOSED',
  resolveLeaseClaim({ data: null, error: { code: '08006', message: 'connection failure' } }), { ok: false, reason: 'error' });
expect('6f empty-string token is not a valid token → in_progress',
  resolveLeaseClaim({ data: '', error: null }), { ok: false, reason: 'in_progress' });

// =============================================================================================
// §P0-1 (v2)  AMOUNT/CURRENCY MISMATCH CLEANUP OUTCOME.
//   mismatch + delete CONFIRMED   → no orphan, benefit may release.
//   mismatch + delete UNCONFIRMED → record orphan, RETAIN benefit.
// =============================================================================================
expect('v2-1 mismatch + deletion succeeds → release benefit, no orphan',
  draftCreateFailureOutcome({ attempted: true, confirmed: true }),
  { recordOrphan: false, retainBenefit: false, orphanDraftId: null });
expect('v2-2 amount mismatch + deletion fails → orphan recorded, benefit RETAINED',
  draftCreateFailureOutcome({ attempted: true, confirmed: false, orphanDraftId: 'gid://shopify/DraftOrder/9' }),
  { recordOrphan: true, retainBenefit: true, orphanDraftId: 'gid://shopify/DraftOrder/9' });
expect('v2-3 currency mismatch + deletion fails → same fail-closed behaviour',
  draftCreateFailureOutcome({ attempted: true, confirmed: false, orphanDraftId: 'gid://shopify/DraftOrder/10' }).retainBenefit, true);
expect('v2-1b no cleanup at all (draft never created) → release benefit',
  draftCreateFailureOutcome(undefined), { recordOrphan: false, retainBenefit: false, orphanDraftId: null });

// =============================================================================================
// §HIGH-3  SAMPLE PURCHASE GATE (authoritative settings, fail closed).
// =============================================================================================
expect('h3-1 authoritative load ok + enabled + valid price → ok',
  samplePurchaseGate({ loaded: true, enabled: true, priceCents: 4000 }), { ok: true });
expect('h3-2 settings DB error → settings_unavailable (do NOT create sample)',
  samplePurchaseGate({ loaded: false, enabled: true, priceCents: 4000 }), { ok: false, reason: 'settings_unavailable' });
expect('h3-3 samples disabled → rejected',
  samplePurchaseGate({ loaded: true, enabled: false, priceCents: 4000 }), { ok: false, reason: 'disabled' });
expect('h3-4 configured price is authoritative (non-default 6000 accepted)',
  samplePurchaseGate({ loaded: true, enabled: true, priceCents: 6000 }), { ok: true });
expect('h3-5 invalid price → rejected',
  samplePurchaseGate({ loaded: true, enabled: true, priceCents: 0 }), { ok: false, reason: 'invalid_price' });

// =============================================================================================
// §HIGH-5  BENEFIT ACTION PRECEDENCE (cancelled wins over paid).
// =============================================================================================
expect('h5-1 paid + not cancelled → consume', benefitAction({ isPaid: true, isCancelled: false }), 'consume');
expect('h5-2 cancelled + not paid → release', benefitAction({ isPaid: false, isCancelled: true }), 'release');
expect('h5-3 paid + cancelled → release (cancelled wins, never consume)', benefitAction({ isPaid: true, isCancelled: true }), 'release');
expect('h5-4 neither paid nor cancelled → none', benefitAction({ isPaid: false, isCancelled: false }), 'none');

// ---------------------------------------------------------------------------------------------
// eslint-disable-next-line no-console
console.log(failures === 0 ? '\nALL CHECKOUT-GUARD TESTS PASSED' : `\n${failures} CHECKOUT-GUARD TEST(S) FAILED`);
if (failures > 0) process.exit(1);
