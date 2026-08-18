import { NextRequest, NextResponse } from 'next/server';
import crypto from 'node:crypto';
import { getWebhookSecret, isWebhookConfigured } from '@/config/shopify-admin';
import { createSupabaseServiceClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

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
function euroToCents(total: string | undefined): number | null {
  if (!total) return null;
  const [w, f = ''] = String(total).split('.');
  return Number(w) * 100 + Number((f + '00').slice(0, 2));
}
function normEmail(order: any): string | null {
  const e = order?.email ?? order?.contact_email ?? order?.customer?.email ?? null;
  return e ? String(e).trim().toLowerCase() : null;
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
  const topic = req.headers.get('x-shopify-topic') ?? 'orders/paid';
  const svc = createSupabaseServiceClient();
  if (!svc) return NextResponse.json({ error: 'supabase_unconfigured' }, { status: 503 });

  const order = JSON.parse(raw);
  const shopifyOrderId = String(order.id);
  const isPaid = order.financial_status === 'paid';
  const isCancelled = Boolean(order.cancelled_at);
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
  if (action === 'locked')    return NextResponse.json({ ok: true, locked: true });

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
  const setStatus = async (status: 'completed' | 'failed'): Promise<boolean> => {
    try {
      const { error } = await svc.rpc('mark_webhook_event', { p_topic: topic, p_order_id: shopifyOrderId, p_status: status });
      if (error) { console.error(`[webhook] mark ${status} failed:`, error.message); return false; }
      return true;
    } catch (e) { console.error(`[webhook] mark ${status} threw:`, e instanceof Error ? e.message : e); return false; }
  };

  try {
    const ship = order.shipping_address ?? {}; const bill = order.billing_address ?? {};
    const configId = attr(order, 'BUGO Configuration ID');
    const sampleOrderId = attr(order, 'BUGO Sample Order ID');

    // -------- SAMPLE-PRODUCT order (distinguished by the server-set attribute) --------
    if (sampleOrderId) {
      const { data: sampleRow } = await svc.from('sample_orders').select('id, auth_user_id, customer_id, email')
        .eq('id', sampleOrderId).maybeSingle();
      const paymentState: 'paid' | 'cancelled' | 'pending' = isCancelled ? 'cancelled' : isPaid ? 'paid' : 'pending';

      await must(svc.from('sample_orders').update({ shopify_order_id: shopifyOrderId, payment_state: paymentState })
        .eq('id', sampleOrderId), 'sample_orders state');

      // §P0 GUEST EMAIL: a sample bought as a guest was inserted with email = null. Persist
      // the email Shopify captured at checkout so the later verified-account credit linking
      // can find it. Fill ONLY when currently null (never overwrite an authenticated email).
      if (email) {
        await must(svc.from('sample_orders').update({ email }).eq('id', sampleOrderId).is('email', null),
          'sample_orders email');
        // If a REAL account (customers row with an auth link) already owns this email, attach
        // the (still-unlinked) guest purchase to it. The email came from Shopify's paid
        // checkout — not client-supplied — so it can safely grant the credit later.
        const { data: acct } = await svc.from('customers').select('id, auth_user_id')
          .ilike('email', email).not('auth_user_id', 'is', null).limit(1).maybeSingle();
        if (acct) {
          await must(svc.from('sample_orders')
            .update({ customer_id: acct.id, auth_user_id: acct.auth_user_id })
            .eq('id', sampleOrderId).is('auth_user_id', null), 'sample_orders link acct');
        }
      }

      const row: Record<string, any> = {
        shopify_order_id: shopifyOrderId,
        shopify_order_name: order.name ?? null,
        configuration_id: null,
        order_kind: 'sample',
        sample_order_id: sampleOrderId,
        customer_id: sampleRow?.customer_id ?? null,
        customer_email: email ?? sampleRow?.email ?? null,
        customer_first_name: order.customer?.first_name ?? ship.first_name ?? null,
        customer_last_name: order.customer?.last_name ?? ship.last_name ?? null,
        company: ship.company ?? bill.company ?? null,
        phone: order.phone ?? ship.phone ?? null,
        billing_address: bill, shipping_address: ship,
        total_paid_cents: euroToCents(order.total_price) ?? 0,
        currency: order.currency ?? 'EUR',
        payment_state: order.financial_status ?? null,
        subtotal_cents: 0,
        total_cents: euroToCents(order.total_price) ?? 0,
      };
      await must(svc.from('orders').upsert(row, { onConflict: 'shopify_order_id' }), 'orders upsert (sample)');
      if (!(await setStatus('completed'))) return NextResponse.json({ error: 'status_persist_failed' }, { status: 500 });
      return NextResponse.json({ ok: true, kind: 'sample' });
    }

    // -------- MAIN-PRODUCT order --------
    let cfg: any = null;
    if (configId) {
      const { data } = await svc.from('configurations').select('*').eq('id', configId).maybeSingle();
      cfg = data;
    }

    // Resolve the placing customer. Prefer the auth_user_id recorded on the configuration
    // at checkout time (what first-order eligibility keys off of); fall back to email match
    // for guest orders (identity linking only — guests never receive benefits).
    let customerId: string | null = null;
    if (cfg?.auth_user_id) {
      const { data: existing } = await svc.from('customers').select('id').eq('auth_user_id', cfg.auth_user_id).maybeSingle();
      if (existing) customerId = existing.id;
      else if (email) {
        const created = await must(svc.from('customers')
          .insert({ auth_user_id: cfg.auth_user_id, email }).select('id').maybeSingle(), 'customers insert');
        customerId = (created as any)?.id ?? null;
      }
    } else if (email) {
      const { data: byEmail } = await svc.from('customers').select('id').eq('email', email).limit(1).maybeSingle();
      customerId = byEmail?.id ?? null;
    }

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
      total_paid_cents: euroToCents(order.total_price) ?? cfg?.total_price_cents ?? 0,
      currency: order.currency ?? cfg?.currency ?? 'EUR',
      payment_state: order.financial_status ?? null,
      subtotal_cents: cfg?.base_price_cents ?? 0,
      total_cents: cfg?.total_price_cents ?? euroToCents(order.total_price) ?? 0,
    };
    await must(svc.from('orders').upsert(row, { onConflict: 'shopify_order_id' }), 'orders upsert (main)');
    if (cfg?.id) await must(svc.from('configurations').update({ status: 'ordered' }).eq('id', cfg.id), 'configuration status');

    // §P0-3 FINALIZE benefits — only on confirmed payment, for the exact configuration this
    // order was priced against, idempotently (safe under duplicate/retry deliveries).
    if (isPaid && cfg?.benefit_type === 'sample_credit' && cfg?.sample_order_id) {
      await must(svc.from('sample_orders')
        .update({ credit_used_at: new Date().toISOString(), credit_used_configuration_id: cfg.id,
                  credit_reserved_config_id: null, credit_reservation_expires_at: null })
        .eq('id', cfg.sample_order_id)
        .is('credit_used_at', null), 'sample credit consume');   // WHERE enforces single-use even under races
    }
    if (isPaid && cfg?.benefit_type === 'first_order_5pct' && customerId) {
      await must(svc.rpc('consume_first_order', { p_customer_id: customerId, p_config_id: cfg.id }), 'consume_first_order');
    }

    // §P0-3 RELEASE benefits if the order was cancelled, so an abandoned/cancelled attempt
    // never strands the credit / first-order claim (they also auto-expire via the RPCs).
    if (isCancelled && cfg) {
      if (cfg.benefit_type === 'sample_credit' && cfg.sample_order_id) {
        await must(svc.rpc('release_sample_credit', { p_sample_order_id: cfg.sample_order_id, p_config_id: cfg.id }), 'release_sample_credit');
      } else if (cfg.benefit_type === 'first_order_5pct' && customerId) {
        await must(svc.rpc('release_first_order', { p_customer_id: customerId, p_config_id: cfg.id }), 'release_first_order');
      }
    }

    if (!(await setStatus('completed'))) return NextResponse.json({ error: 'status_persist_failed' }, { status: 500 });
    return NextResponse.json({ ok: true, kind: 'main' });
  } catch (e: unknown) {
    console.error('[webhook] processing error:', e instanceof Error ? e.message : String(e));
    await setStatus('failed');   // best-effort; leave retryable; Shopify will redeliver
    return NextResponse.json({ error: 'processing_failed' }, { status: 500 });
  }
}
