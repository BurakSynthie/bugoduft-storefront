import 'server-only';
import { randomUUID } from 'node:crypto';
import { createSupabaseServerClient, createSupabaseServiceClient } from '@/lib/supabase/server';
import { isSupabaseConfigured } from '@/lib/supabase/env';
import { getCustomerUser } from '@/lib/customer/session';
import { finalizeCheckout } from '@/app/actions/checkout';
import type { IncomingConfig } from '@/repositories/configurations';

export type ReorderResult =
  | { ok: true; checkoutUrl: string }
  | { ok: false; code: 'auth_required' | 'not_found' | 'unconfigured' | 'invalid' | 'missing_variant' | 'error'; message: string };

// Completion pass §9: secure reorder-artwork reuse.
//
// A signed-in customer can re-order a PAST order's exact configuration (collection,
// quantity, scent, shape, intensity, artwork) without re-uploading files.
//
// Security model:
// - Ownership is verified by the database itself, not by application logic: the source
//   order is read through the CUSTOMER's own RLS-scoped session client (the
//   customer_read_own_orders policy from migration 0009), so a customer can never reach
//   another customer's order or artwork no matter what id is supplied — a cross-user id
//   simply returns no row.
// - The source order's linked configuration is then read with the service client (safe:
//   ownership was already proven by the previous RLS-scoped read).
// - This NEVER mutates the source order or its configuration row — it always creates a
//   brand-new configuration (fresh id) and a brand-new Shopify Draft Order through the
//   SAME finalizeCheckout() path used by every other checkout (no new commerce
//   architecture, no bypass of server-side pricing/benefit recomputation).
// - "Artwork reuse" means carrying the stable private-bucket storage PATH STRING forward
//   from the old configuration row into the new one. No signed URL is generated or relied
//   on anywhere in this flow (signed URLs are short-lived previews only, generated
//   on-demand elsewhere — never persisted, never reused here).
// - Pricing/benefits are always recomputed fresh by finalizeCheckout -> validateAndPrice
//   for the new order, so a previously-consumed sample credit or first-order benefit is
//   correctly NOT re-applied — eligibility is never copied from the old order.
export async function beginReorder(orderId: string): Promise<ReorderResult> {
  if (!isSupabaseConfigured()) {
    return { ok: false, code: 'unconfigured', message: 'Der Checkout ist noch nicht konfiguriert.' };
  }
  const user = await getCustomerUser();
  if (!user) return { ok: false, code: 'auth_required', message: 'Bitte melden Sie sich an, um erneut zu bestellen.' };

  const sb = createSupabaseServerClient();
  if (!sb) return { ok: false, code: 'unconfigured', message: 'Der Checkout ist noch nicht konfiguriert.' };
  const { data: order } = await sb.from('orders').select('id, configuration_id').eq('id', orderId).maybeSingle();
  if (!order?.configuration_id) return { ok: false, code: 'not_found', message: 'Bestellung wurde nicht gefunden.' };

  const svc = createSupabaseServiceClient();
  if (!svc) return { ok: false, code: 'unconfigured', message: 'Der Checkout ist noch nicht konfiguriert.' };
  const { data: source } = await svc.from('configurations').select('*').eq('id', order.configuration_id).maybeSingle();
  if (!source) return { ok: false, code: 'not_found', message: 'Die ursprüngliche Konfiguration wurde nicht gefunden.' };

  const cfg: IncomingConfig = {
    configId: randomUUID(),
    locale: (source.locale as IncomingConfig['locale']) ?? 'de',
    collectionCode: source.collection_code,
    scentCode: source.scent_code ?? null,
    scentCode2: source.scent_code_2 ?? null,
    intensity: source.intensity === 'intense' ? 'intense' : 'normal',
    shape: source.shape,
    quantity: source.quantity,
    frontInstructions: source.front_instructions ?? '',
    sameBackAsFront: source.same_back_as_front,
    backInstructions: source.back_instructions ?? '',
    designMode: source.design_mode === 'ready_file' ? 'ready_file' : 'bugo_creates',
  };
  const paths = {
    frontPath: source.front_path ?? null,
    backPath: source.same_back_as_front ? null : (source.back_path ?? null),
    supporting: Array.isArray(source.supporting) ? source.supporting : [],
  };

  const result = await finalizeCheckout(cfg, paths);
  if (!result.ok) return result;

  // Traceability only (admin order detail / customer history) — never touches the source row.
  await svc.from('configurations').update({ reused_from_configuration_id: source.id }).eq('id', cfg.configId);

  return { ok: true, checkoutUrl: result.checkoutUrl };
}
