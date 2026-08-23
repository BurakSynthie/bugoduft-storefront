import { NextRequest, NextResponse } from 'next/server';
import crypto from 'node:crypto';
import { getWebhookSecret, isWebhookConfigured } from '@/config/shopify-admin';
import { createSupabaseServiceClient } from '@/lib/supabase/server';
import { normalizeEmailOrNull } from '@/lib/customer/email';
import { verifyMoney, parseMoneyToCents } from '@/lib/checkout/money';
import { resolveEventAt } from '@/lib/checkout/event-time';
import { classifyOrigin } from '@/lib/checkout/origin';
import { buildOrderSnapshot } from '@/lib/checkout/order-snapshot';
import { sendServerPurchase } from '@/lib/analytics/server-purchase';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// §OPTION-2 ISSUE-2 explicit topic allowlist. The endpoint genuinely handles paid + cancelled
// order deliveries; any other or a MISSING topic must never be treated as payment.
const SUPPORTED_TOPICS = new Set(['orders/paid', 'orders/cancelled']);

function verify(raw: string, hmacHeader: string | null): boolean {
  if (!hmacHeader) return false;
  const digest = crypto.createHmac('sha256', getWebhookSecret()).update(raw, 'utf8').digest('base64');
  try { return crypto.timingSafeEqual(Buffer.from(digest), Buffer.from(hmacHeader)); } catch { return false; }
}
function attr(order: any, key: string): string | null {
  const list = order?.line_items?.flatMap((li: any) => li.properties ?? []) ?? [];
  const found = list.find((p: any) => p?.name === key);
  return found?.value ?? null;
}
function normEmail(order: any): string | null {
  // §SMALL centralized normalization — identity linking uses exact equality on this value.
  const e = order?.email ?? order?.contact_email ?? order?.customer?.email ?? null;
  return normalizeEmailOrNull(e == null ? null : String(e));
}

export async function POST(req: NextRequest) {
  if (!isWebhookConfigured()) {
    console.error('[webhook] SHOPIFY_WEBHOOK_SECRET not configured');
    return NextResponse.json({ error: 'webhook_unconfigured' }, { status: 503 });   // honest, not faked
  }
  const raw = await req.text();
  if (!verify(raw, req.headers.get('x-shopify-hmac-sha256'))) {
    return NextResponse.json({ error: 'invalid_hmac' }, { status: 401 });
  }
  // §OPTION-2 ISSUE-2 topic MUST be explicitly supported. A missing or unknown topic is
  // rejected BEFORE any DB claim or state mutation — it can never default to 'orders/paid'.
  const topic = req.headers.get('x-shopify-topic');
  if (!topic || !SUPPORTED_TOPICS.has(topic)) {
    console.warn('[webhook] rejected topic:', topic ?? '(missing)');
    // 2xx-but-ignored: acknowledge so Shopify does not retry an unsupported topic forever,
    // WITHOUT touching payment/benefit/configuration state.
    return NextResponse.json({ ok: true, ignored: true, topic: topic ?? null });
  }
  const svc = createSupabaseServiceClient();
  if (!svc) return NextResponse.json({ error: 'supabase_unconfigured' }, { status: 503 });

  const order = JSON.parse(raw);
  const shopifyOrderId = String(order.id);
  const isPaid = order.financial_status === 'paid';
  const isCancelled = Boolean(order.cancelled_at);
  // §OPTION-2 DEFECT-5 authoritative event timestamp (NOT server receipt time), validated and
  // fail-closed: X-Shopify-Triggered-At preferred, then trusted payload timestamp. An invalid /
  // missing authoritative timestamp yields null and must block payment/config/benefit mutation.
  const eventAt = resolveEventAt({
    triggeredAtHeader: req.headers.get('x-shopify-triggered-at'),
    cancelledAt: order.cancelled_at,
    updatedAt: order.updated_at,
    isCancelled,
  });
  // §P0-2 AUTHORITATIVE BUGO payment state — cancellation WINS. First-order eligibility counts
  // previous paid main orders via orders.payment_state = 'paid'; a cancelled order (even one whose
  // Shopify financial_status is still 'paid') must NOT keep counting as a previous paid order, or it
  // would permanently block the restored first-order benefit. The later 'orders/cancelled' delivery
  // re-upserts the SAME shopify_order_id with this value, transitioning a stored 'paid' → 'cancelled'.
  const effectivePaymentState = isCancelled ? 'cancelled' : (order.financial_status ?? null);
  const email = normEmail(order);

  // -------------------------------------------------------------------------
  // §P0 ATOMIC IDEMPOTENCY LEASE. A single DB function (claim_webhook_event) decides,
  // under one row lock, whether this delivery should be processed:
  //   'duplicate' -> already completed; ack and skip
  //   'locked'    -> another worker holds a fresh lease; ack WITHOUT processing (no
  //                  concurrent processing; if that worker dies the lease goes stale and
  //                  a later Shopify retry reclaims it)
  //   'process'   -> we now own a fresh/reclaimed lease and must finish it
  // Replaces the previous non-atomic insert→catch→read→update, which allowed two
  // concurrent deliveries to process the same event.
  const claim = await svc.rpc('claim_webhook_event',
    { p_topic: topic, p_order_id: shopifyOrderId, p_lease_seconds: 120 });
  if (claim.error) {
    console.error('[webhook] claim failed:', claim.error.message);
    return NextResponse.json({ error: 'db' }, { status: 500 });   // retryable
  }
  const action = claim.data as string;
  if (action === 'duplicate') return NextResponse.json({ ok: true, duplicate: true });
  if (action === 'locked') {
    // §OPTION-2 DEFECT-3 another worker holds a FRESH lease. This app processes inline with no
    // durable background worker, so we cannot prove that owner will finish. Returning 2xx here
    // would let Shopify treat delivery as done and stop retrying — if that owner then dies, the
    // event is lost. Return retryable non-2xx: a later Shopify redelivery (after the lease goes
    // stale) reclaims and finishes it. Concurrency safety still holds because claim_webhook_event
    // only hands 'process' to one worker at a time.
    return NextResponse.json({ ok: false, locked: true }, { status: 409 });
  }

  // Every REQUIRED write goes through must(): a Supabase client error does NOT throw on its
  // own, so we inspect { error } and throw, letting the single catch mark the event 'failed'
  // (retryable 500). The event is only marked 'completed' after ALL required writes succeed.
  const must = async <T,>(p: PromiseLike<{ error: any; data?: T }>, label: string): Promise<T | undefined> => {
    const { error, data } = (await p) as any;
    if (error) throw new Error(`${label}: ${error.message ?? 'db_error'}`);
    return data as T | undefined;
  };
  // Status writes must themselves be checked: a Supabase error does NOT throw, so a failed
  // 'completed' write must never be mistaken for success. setStatus never throws and reports
  // whether the write landed. markFailed swallows its own failure (best-effort; the 500 we
  // already return will cause Shopify to redeliver, and the atomic lease reclaims it).
  const setStatus = async (status: 'completed' | 'failed' | 'reconciled'): Promise<boolean> => {
    try {
      const { error } = await svc.rpc('mark_webhook_event', { p_topic: topic, p_order_id: shopifyOrderId, p_status: status });
      if (error) { console.error(`[webhook] mark ${status} failed:`, error.message); return false; }
      return true;
    } catch (e) { console.error(`[webhook] mark ${status} threw:`, e instanceof Error ? e.message : e); return false; }
  };

  try {
    const ship = order.shipping_address ?? {}; const bill = order.billing_address ?? {};
    // §hide-internal Configuration ID is now attached under the HIDDEN key
    // '_BUGO Configuration ID' (underscore = hidden from customer checkout). Read the new key
    // first, fall back to the legacy un-prefixed key so orders created before this change still
    // resolve. Same value either way — order↔configuration linkage is unchanged.
    const rawConfigId = attr(order, '_BUGO Configuration ID') ?? attr(order, 'BUGO Configuration ID');
    const rawSampleOrderId = attr(order, 'BUGO Sample Order ID');

    // §OPTION-2 ORIGIN CLASSIFICATION before any BUGO commerce mutation. classifyOrigin normalizes
    // (trims) + UUID-validates the markers and returns the authoritative kind AND the normalized
    // id. The route branches ONLY on origin.kind and uses ONLY the normalized ids below — raw
    // markers never re-enter commerce logic, so classification and execution cannot disagree.
    const origin = classifyOrigin(rawConfigId, rawSampleOrderId);
    if (origin.kind === 'none') {
      console.warn('[webhook] non-BUGO order (no origin marker), ignoring:', shopifyOrderId);
      if (!(await setStatus('completed'))) return NextResponse.json({ error: 'status_persist_failed' }, { status: 500 });
      return NextResponse.json({ ok: true, ignored: true, reason: 'no_bugo_marker' });
    }
    if (origin.kind === 'ambiguous') {
      console.error('[webhook] ambiguous BUGO origin (both markers):', shopifyOrderId);
      await must(svc.rpc('record_paid_mismatch', {
        p_source: 'main_checkout', p_shopify_order_id: shopifyOrderId,
        p_config_id: null, p_sample_order_id: null,
        p_expected_amount_cents: null, p_actual_amount_cents: parseMoneyToCents(order.total_price),
        p_expected_currency: null, p_actual_currency: order.currency ?? null,
        p_reason: 'ambiguous_origin_both_markers',
      }), 'record ambiguous-origin anomaly');
      if (!(await setStatus('reconciled'))) return NextResponse.json({ error: 'status_persist_failed' }, { status: 500 });
      return NextResponse.json({ ok: true, reconciled: 'ambiguous_origin' });
    }
    // §OPTION-2 DEFECT-3 a present marker that is NOT a valid UUID is deterministic garbage: never
    // send it to a uuid DB predicate (that would be a repeated 500). Record once, terminate safely.
    if (origin.kind === 'invalid') {
      console.error('[webhook] malformed BUGO origin marker:', shopifyOrderId);
      await must(svc.rpc('record_paid_mismatch', {
        p_source: 'main_checkout', p_shopify_order_id: shopifyOrderId,
        p_config_id: null, p_sample_order_id: null,
        p_expected_amount_cents: null, p_actual_amount_cents: parseMoneyToCents(order.total_price),
        p_expected_currency: null, p_actual_currency: order.currency ?? null,
        p_reason: 'malformed_origin_marker',
      }), 'record malformed-origin anomaly');
      if (!(await setStatus('reconciled'))) return NextResponse.json({ error: 'status_persist_failed' }, { status: 500 });
      return NextResponse.json({ ok: true, reconciled: 'malformed_origin' });
    }

    // From here on ONLY the normalized, validated ids are used. Exactly one is non-null.
    const configId = origin.kind === 'main' ? origin.configId : null;
    const sampleOrderId = origin.kind === 'sample' ? origin.sampleOrderId : null;

    // §OPTION-2 DEFECT-5 a BUGO order drives the monotonic state machine, which REQUIRES a valid
    // authoritative event timestamp. If none could be resolved, do not mutate payment/config/
    // benefit state — record an anomaly and stop safely rather than corrupting ordering.
    if (!eventAt) {
      console.error('[webhook] no valid authoritative event timestamp:', shopifyOrderId);
      await must(svc.rpc('record_paid_mismatch', {
        p_source: origin.kind === 'sample' ? 'sample_checkout' : 'main_checkout', p_shopify_order_id: shopifyOrderId,
        p_config_id: null, p_sample_order_id: null,
        p_expected_amount_cents: null, p_actual_amount_cents: parseMoneyToCents(order.total_price),
        p_expected_currency: null, p_actual_currency: order.currency ?? null,
        p_reason: 'missing_authoritative_event_timestamp',
      }), 'record missing-timestamp anomaly');
      if (!(await setStatus('reconciled'))) return NextResponse.json({ error: 'status_persist_failed' }, { status: 500 });
      return NextResponse.json({ ok: true, reconciled: 'missing_event_timestamp' });
    }

    // -------- SAMPLE-PRODUCT order (origin.kind === 'sample') --------
    if (origin.kind === 'sample') {
      // §OPTION-2 ISSUE-1 fail closed: a DB error on this lookup must NOT collapse into
      // "sample not found". Distinguish query failure (retryable 500) from genuine absence.
      const { data: sampleRow, error: sampleErr } = await svc.from('sample_orders')
        .select('id, auth_user_id, customer_id, email, amount_cents, currency')
        .eq('id', sampleOrderId).maybeSingle();
      if (sampleErr) throw new Error('sample lookup: ' + sampleErr.message);
      if (!sampleRow) {
        // §OPTION-2 ISSUE-1 the order CARRIES a BUGO Sample Order ID but the row genuinely does
        // not exist. Never silently continue as an unrelated order — record + terminate safely.
        console.error('[webhook] sample order id present but row missing:', sampleOrderId);
        await must(svc.rpc('record_paid_mismatch', {
          p_source: 'sample_checkout', p_shopify_order_id: shopifyOrderId,
          p_config_id: null, p_sample_order_id: null,
          p_expected_amount_cents: null, p_actual_amount_cents: parseMoneyToCents(order.total_price),
          p_expected_currency: null, p_actual_currency: order.currency ?? null,
          p_reason: 'sample_order_row_missing',
        }), 'record sample-missing anomaly');
        if (!(await setStatus('reconciled'))) return NextResponse.json({ error: 'status_persist_failed' }, { status: 500 });
        return NextResponse.json({ ok: true, kind: 'sample', reconciled: 'row_missing' });
      }
      // §MEDIUM-11 use the resolved customer id (updated if we link an account below), never the
      // stale pre-link value, when persisting the order row.
      let resolvedCustomerId: string | null = sampleRow?.customer_id ?? null;
      const paymentState: 'paid' | 'cancelled' | 'pending' = isCancelled ? 'cancelled' : isPaid ? 'paid' : 'pending';

      // §OPTION-2 ISSUE-3 SAMPLE amount/currency verification against the HISTORICAL authoritative
      // price persisted at sample creation (sample_orders.amount_cents / .currency) — NOT current
      // settings. Only gate the PAID path; cancelled/pending keep their existing semantics.
      let sampleMismatch: { reason: string } | null = null;
      if (isPaid && !isCancelled) {
        const verdict = verifyMoney(
          sampleRow.amount_cents, sampleRow.currency ?? 'EUR',
          order.total_price, order.currency);
        if (!verdict.ok) {
          sampleMismatch = { reason: verdict.reason };
          console.error('[webhook] sample amount/currency mismatch:', verdict.reason, sampleOrderId);
          // §OPTION-2 DEFECT-2 record the idempotent anomaly BEFORE the atomic state application,
          // so a transient failure here retries via HTTP 500 and the anomaly can never be lost.
          await must(svc.rpc('record_paid_mismatch', {
            p_source: 'sample_checkout', p_shopify_order_id: shopifyOrderId,
            p_config_id: null, p_sample_order_id: sampleOrderId,
            p_expected_amount_cents: sampleRow.amount_cents, p_actual_amount_cents: verdict.actualCents,
            p_expected_currency: (sampleRow.currency ?? 'EUR'), p_actual_currency: verdict.actualCurrency,
            p_reason: 'sample_' + verdict.reason,
          }), 'record sample mismatch');
        }
      }

      // §P0 GUEST EMAIL: a sample bought as a guest was inserted with email = null. Persist
      // the email Shopify captured at checkout so the later verified-account credit linking
      // can find it. Fill ONLY when currently null (never overwrite an authenticated email).
      if (email) {
        await must(svc.from('sample_orders').update({ email }).eq('id', sampleOrderId).is('email', null),
          'sample_orders email');
        // If a REAL account (customers row with an auth link) already owns this email, attach
        // the (still-unlinked) guest purchase to it. The email came from Shopify's paid
        // checkout — not client-supplied — so it can safely grant the credit later.
        // §SMALL-6 EXACT identity match: `email` is already trim+lowercased (normEmail); use
        // equality, NOT ILIKE — `%`/`_` are legal in an email local part and ILIKE would treat
        // them as wildcards, which could link the purchase to the WRONG account.
        // §P0-1b VERIFIED-IDENTITY GATE: only link to an account whose email was actually
        // verified (email_verified_at non-null), never merely because auth_user_id is set.
        // An unverified sign-up as the victim's address therefore cannot capture the credit.
        const { data: acct, error: acctErr } = await svc.from('customers').select('id, auth_user_id')
          .eq('email', email).not('auth_user_id', 'is', null).not('email_verified_at', 'is', null)
          .limit(1).maybeSingle();
        if (acctErr) throw new Error('sample acct lookup: ' + acctErr.message);
        if (acct) {
          await must(svc.from('sample_orders')
            .update({ customer_id: acct.id, auth_user_id: acct.auth_user_id })
            .eq('id', sampleOrderId).is('auth_user_id', null), 'sample_orders link acct');
          resolvedCustomerId = acct.id;   // §MEDIUM-11 prefer the freshly-linked customer id
        }
      }

      // §OPTION-2 DEFECT-1 upsert the mirror orders row WITHOUT payment_state; the atomic RPC sets
      // orders.payment_state (and sample_orders.payment_state) together under one per-order lock,
      // so no post-RPC write can leave orders.payment_state='paid' after a newer cancellation.
      const row: Record<string, any> = {
        shopify_order_id: shopifyOrderId,
        shopify_order_name: order.name ?? null,
        configuration_id: null,
        order_kind: 'sample',
        sample_order_id: sampleOrderId,
        customer_id: resolvedCustomerId,
        customer_email: email ?? sampleRow?.email ?? null,
        customer_first_name: order.customer?.first_name ?? ship.first_name ?? null,
        customer_last_name: order.customer?.last_name ?? ship.last_name ?? null,
        company: ship.company ?? bill.company ?? null,
        phone: order.phone ?? ship.phone ?? null,
        billing_address: bill, shipping_address: ship,
        total_paid_cents: parseMoneyToCents(order.total_price) ?? 0,
        currency: order.currency ?? 'EUR',
        subtotal_cents: 0,
        total_cents: parseMoneyToCents(order.total_price) ?? 0,
      };
      await must(svc.from('orders').upsert(row, { onConflict: 'shopify_order_id' }), 'orders upsert (sample)');

      // The incoming sample state, and the mirror orders.payment_state to write when this event
      // wins. A mismatch never becomes 'paid': sample_orders → 'pending', orders → reconciliation_hold.
      const sampleIncoming = sampleMismatch ? 'pending' : paymentState;
      const mirrorState = sampleMismatch ? 'reconciliation_hold' : effectivePaymentState;

      // §OPTION-2 DEFECT-1/3 atomic, monotonic sample + mirror state under a per-order lock: a
      // stale older paid can never resurrect a newer cancellation on EITHER row. 'stale' → neither
      // row's payment_state changes.
      const sampleApply = await must(svc.rpc('apply_sample_order_event', {
        p_shopify_order_id: shopifyOrderId, p_event_at: eventAt,
        p_sample_order_id: sampleOrderId, p_incoming_state: sampleIncoming,
        p_mirror_paid_state: mirrorState,
      }), 'apply_sample_order_event') as unknown as string;
      const sampleStale = sampleApply === 'stale';

      if (sampleMismatch) {
        if (!(await setStatus('reconciled'))) return NextResponse.json({ error: 'status_persist_failed' }, { status: 500 });
        return NextResponse.json({ ok: true, kind: 'sample', reconciled: sampleMismatch.reason });
      }
      // Server-side Purchase only after the authoritative paid event won.
      // Mismatch already returned above; stale/cancelled events never emit Purchase.
      if (isPaid && !isCancelled && !sampleStale) {
        await sendServerPurchase({
          order,
          shopifyOrderId,
          eventAt,
          kind: 'sample',
        });
      }

      if (!(await setStatus('completed'))) return NextResponse.json({ error: 'status_persist_failed' }, { status: 500 });
      return NextResponse.json({ ok: true, kind: 'sample', stale: sampleStale });
    }

    // -------- MAIN-PRODUCT order (origin.kind === 'main') --------
    let cfg: any = null;
    if (origin.kind === 'main') {
      // §OPTION-2 ISSUE-1 fail closed: a DB error must NOT collapse into "no configuration".
      const { data, error: cfgErr } = await svc.from('configurations').select('*').eq('id', configId).maybeSingle();
      if (cfgErr) throw new Error('configuration lookup: ' + cfgErr.message);
      if (!data) {
        // §OPTION-2 ISSUE-1 the order CARRIES a BUGO Configuration ID but the row genuinely does
        // not exist. Do NOT treat as a normal unrelated Shopify order — record + terminate safely.
        console.error('[webhook] configuration id present but row missing:', configId);
        await must(svc.rpc('record_paid_mismatch', {
          p_source: 'main_checkout', p_shopify_order_id: shopifyOrderId,
          p_config_id: null, p_sample_order_id: null,
          p_expected_amount_cents: null, p_actual_amount_cents: parseMoneyToCents(order.total_price),
          p_expected_currency: null, p_actual_currency: order.currency ?? null,
          p_reason: 'configuration_row_missing',
        }), 'record config-missing anomaly');
        if (!(await setStatus('reconciled'))) return NextResponse.json({ error: 'status_persist_failed' }, { status: 500 });
        return NextResponse.json({ ok: true, kind: 'main', reconciled: 'row_missing' });
      }
      cfg = data;
    }

    // Resolve the placing customer. Prefer the auth_user_id recorded on the configuration
    // at checkout time (what first-order eligibility keys off of); fall back to email match
    // for guest orders (identity linking only — guests never receive benefits).
    let customerId: string | null = null;
    if (cfg?.auth_user_id) {
      const { data: existing, error: existErr } = await svc.from('customers').select('id').eq('auth_user_id', cfg.auth_user_id).maybeSingle();
      if (existErr) throw new Error('customer lookup: ' + existErr.message);
      if (existing) customerId = existing.id;
      else if (email) {
        const created = await must(svc.from('customers')
          .insert({ auth_user_id: cfg.auth_user_id, email }).select('id').maybeSingle(), 'customers insert');
        customerId = (created as any)?.id ?? null;
      }
    } else if (email) {
      // §P0-1b guest email fallback: link ONLY to a verified-identity account
      // (email_verified_at non-null), never an unverified sign-up on the victim's address.
      const { data: byEmail, error: byEmailErr } = await svc.from('customers').select('id')
        .eq('email', email).not('email_verified_at', 'is', null).limit(1).maybeSingle();
      if (byEmailErr) throw new Error('main email lookup: ' + byEmailErr.message);
      customerId = byEmail?.id ?? null;
    }

    // §OPTION-2 DEFECT-2 MAIN amount/currency verification (before any state application) so a
    // mismatched payment is never treated as paid. configurations has no currency column; BUGO
    // checks out in EUR (cfg.currency undefined→'EUR').
    let mainMismatch: { reason: string; actualCents: number | null; actualCurrency: string | null } | null = null;
    if (cfg?.id && isPaid && !isCancelled) {
      const verdict = verifyMoney(cfg.total_price_cents, cfg.currency ?? 'EUR', order.total_price, order.currency);
      if (!verdict.ok) mainMismatch = { reason: verdict.reason, actualCents: verdict.actualCents, actualCurrency: verdict.actualCurrency };
    }

    // The incoming authoritative state for the monotonic machine. A verified paid becomes 'paid';
    // a mismatched paid becomes 'reconciliation_hold' (never counted as paid); cancel/pending as-is.
    const incomingState = isCancelled ? 'cancelled'
      : (isPaid ? (mainMismatch ? 'reconciliation_hold' : 'paid') : 'pending');
    // apply_paid drives config→ordered + benefit consume, ONLY for a verified, non-mismatched paid.
    const applyPaid = isPaid && !isCancelled && !mainMismatch;

    // Upsert the order row for traceability WITHOUT payment_state — the atomic RPC below owns
    // payment_state so it is set only when this event authoritatively wins (no stale downgrade).
    // §2 CUSTOMER-SAFE SNAPSHOT: persist an immutable, sanitized configuration snapshot into
    // orders.snapshot so customer order detail shows quantity/scent(s)/shape/etc. The main
    // webhook never wrote order_items, and BUGO's per-1,000 pricing makes a synthetic
    // order_items.unit_price_cents misleading, so the snapshot (jsonb, present since 0001) is
    // the lowest-risk source. Only whitelisted, customer-safe fields are included — never
    // private storage paths, secrets, Shopify access data, or lease tokens. This is a plain
    // column on the idempotent upsert below, so it never changes payment/benefit behavior or
    // duplicates orders; a webhook retry simply rewrites the same snapshot.
    const snapshot = buildOrderSnapshot(cfg);
    const row: Record<string, any> = {
      shopify_order_id: shopifyOrderId,
      shopify_order_name: order.name ?? null,
      configuration_id: cfg?.id ?? null,
      order_kind: 'main',
      customer_id: customerId,
      customer_email: email ?? null,
      customer_first_name: order.customer?.first_name ?? ship.first_name ?? null,
      customer_last_name: order.customer?.last_name ?? ship.last_name ?? null,
      company: ship.company ?? bill.company ?? null,
      phone: order.phone ?? ship.phone ?? null,
      billing_address: bill, shipping_address: ship,
      total_paid_cents: parseMoneyToCents(order.total_price) ?? cfg?.total_price_cents ?? 0,
      currency: order.currency ?? cfg?.currency ?? 'EUR',
      subtotal_cents: cfg?.base_price_cents ?? 0,
      total_cents: cfg?.total_price_cents ?? parseMoneyToCents(order.total_price) ?? 0,
      snapshot,
    };
    await must(svc.from('orders').upsert(row, { onConflict: 'shopify_order_id' }), 'orders upsert (main)');

    // §OPTION-2 DEFECT-2 record the idempotent mismatch anomaly BEFORE the atomic state
    // application. If this transiently fails we return 500 before committing state, and the retry
    // redoes both; if it succeeds and a later step fails, the retry finds apply_main_order_event
    // returns 'stale' but the anomaly already durably exists. Either way the anomaly can never be
    // permanently lost, and payment_state never becomes 'paid' for a mismatch.
    if (mainMismatch) {
      console.error('[webhook] main amount/currency mismatch:', mainMismatch.reason, cfg.id);
      await must(svc.rpc('record_paid_mismatch', {
        p_source: 'main_checkout', p_shopify_order_id: shopifyOrderId,
        p_config_id: cfg.id, p_sample_order_id: null,
        p_expected_amount_cents: cfg.total_price_cents, p_actual_amount_cents: mainMismatch.actualCents,
        p_expected_currency: (cfg.currency ?? 'EUR'), p_actual_currency: mainMismatch.actualCurrency,
        p_reason: 'main_' + mainMismatch.reason,
      }), 'record main mismatch');
    }

    // §OPTION-2 DEFECT-2/4 ATOMIC cross-topic application: ordering decision + payment_state +
    // configuration status + benefit consume/revert all happen inside ONE transaction under a
    // per-shopify_order_id advisory lock shared by paid and cancelled. A stale older paid can never
    // interleave with (and resurrect) a newer cancellation.
    const applied = await must(svc.rpc('apply_main_order_event', {
      p_shopify_order_id: shopifyOrderId,
      p_event_at: eventAt,
      p_incoming_state: incomingState,
      p_apply_paid: applyPaid,
      p_is_cancelled: isCancelled,
      p_config_id: cfg?.id ?? null,
      p_customer_id: customerId,
      p_benefit_type: cfg?.benefit_type ?? null,
      p_sample_order_id: cfg?.sample_order_id ?? null,
    }), 'apply_main_order_event') as unknown as string;

    if (applied === 'stale') {
      // A newer event already won; this older delivery changed no payment/config/benefit state.
      // If THIS delivery was itself a mismatch, its anomaly was already durably recorded above.
      if (!(await setStatus(mainMismatch ? 'reconciled' : 'completed'))) return NextResponse.json({ error: 'status_persist_failed' }, { status: 500 });
      return NextResponse.json({ ok: true, kind: 'main', stale: true });
    }

    // Applied. A mismatch is terminal 'reconciled' (anomaly already recorded before apply).
    if (mainMismatch) {
      if (!(await setStatus('reconciled'))) return NextResponse.json({ error: 'status_persist_failed' }, { status: 500 });
      return NextResponse.json({ ok: true, kind: 'main', reconciled: mainMismatch.reason });
    }

    // Server-side Purchase only for an authoritative, non-stale, amount-verified paid event.
    if (applyPaid) {
      await sendServerPurchase({
        order,
        shopifyOrderId,
        eventAt,
        kind: 'main',
      });
    }

    if (!(await setStatus('completed'))) return NextResponse.json({ error: 'status_persist_failed' }, { status: 500 });
    return NextResponse.json({ ok: true, kind: 'main' });
  } catch (e: unknown) {
    console.error('[webhook] processing error:', e instanceof Error ? e.message : String(e));
    // §OPTION-2 DEFECT-3 best-effort mark 'failed' so a retry reclaims immediately. Even if this
    // mark itself fails and the row stays 'processing', recovery is still guaranteed: we return
    // non-2xx (Shopify redelivers), and a redelivery arriving after the 120s lease goes stale is
    // reclaimed by claim_webhook_event ('process'); one arriving earlier gets 'locked' → non-2xx
    // (not a terminal 2xx ack), so Shopify keeps retrying until the lease expires. The retry is
    // never silently lost.
    await setStatus('failed');
    return NextResponse.json({ error: 'processing_failed' }, { status: 500 });
  }
}
