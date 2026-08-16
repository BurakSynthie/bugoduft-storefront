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

  // idempotency: skip if this (topic, order) was already processed
  const { error: evErr } = await svc.from('shopify_webhook_events')
    .insert({ topic, shopify_order_id: shopifyOrderId });
  if (evErr && (evErr as any).code === '23505') return NextResponse.json({ ok: true, duplicate: true });

  const configId = attr(order, 'BUGO Configuration ID');
  let cfg: any = null;
  if (configId) {
    const { data } = await svc.from('configurations').select('*').eq('id', configId).maybeSingle();
    cfg = data;
  }
  const ship = order.shipping_address ?? {}; const bill = order.billing_address ?? {};
  const row: Record<string, any> = {
    shopify_order_id: shopifyOrderId,
    shopify_order_name: order.name ?? null,
    configuration_id: cfg?.id ?? null,
    customer_email: order.email ?? order.contact_email ?? null,
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
  // idempotent upsert on shopify_order_id (webhook retries never duplicate)
  const { error } = await svc.from('orders').upsert(row, { onConflict: 'shopify_order_id' });
  if (error) { console.error('[webhook] order upsert failed:', error.message); return NextResponse.json({ error: 'db' }, { status: 500 }); }
  if (cfg?.id) await svc.from('configurations').update({ status: 'ordered' }).eq('id', cfg.id);
  return NextResponse.json({ ok: true });
}
