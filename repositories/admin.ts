// Admin persistence foundation. Money crosses the boundary as integer cents
// (the admin MoneyInput already converts EUR<->cents). Storage stays in cents.
// Writes require the service-role client (server only) until admin auth exists.
import 'server-only';
import { createSupabaseServiceClient } from '@/lib/supabase/server';
import { isSupabaseConfigured } from '@/lib/supabase/env';

export type AdminResult<T = unknown> =
  | { ok: true; data: T }
  | { ok: false; reason: 'unconfigured' | 'auth_required'; message: string };

// Real admin auth is a later phase. Until then, catalog writes are intentionally
// blocked here rather than weakening RLS. This is the isolated security blocker.
const ADMIN_AUTH_READY = false;

function guardWrite(): AdminResult<never> | null {
  if (!isSupabaseConfigured()) return { ok:false, reason:'unconfigured',
    message:'Supabase yapılandırılmadı. Kaydetme, kimlik bilgileri girildiğinde etkinleşir.' };
  if (!ADMIN_AUTH_READY) return { ok:false, reason:'auth_required',
    message:'Yönetici kimlik doğrulaması henüz yok. Yazma işlemleri güvenli şekilde kilitli.' };
  return null;
}

export type ProductWrite = {
  productCode: string;
  basePriceCents: number;                    // integer cents
  minQty: number; qtyStep: number; maxQty: number;
  tiers: { minQty: number; unitPriceCents: number }[];
  options: { key: string; labelDe: string; priceDeltaCents: number }[];
  translations: Record<'de'|'en'|'fr', {
    name:string; slug:string; h1?:string; shortDesc?:string; longDesc?:string;
    seoTitle?:string; seoDescription?:string; }>;
};

function assertCents(...vals: number[]) {
  for (const v of vals) if (!Number.isInteger(v) || v < 0) throw new Error(`Money must be a non-negative integer cent value, got ${v}`);
}

export async function getProductForEdit(productCode: string): Promise<AdminResult> {
  if (!isSupabaseConfigured()) return { ok:false, reason:'unconfigured', message:'Supabase yapılandırılmadı.' };
  const c = createSupabaseServiceClient();
  if (!c) return { ok:false, reason:'unconfigured', message:'Supabase yapılandırılmadı.' };
  const { data, error } = await c.from('products')
    .select(`*, product_translations(*), product_price_tiers(*), product_options(*)`)
    .eq('product_code', productCode).maybeSingle();
  if (error) return { ok:false, reason:'unconfigured', message:error.message };
  return { ok:true, data };
}

export async function upsertProduct(input: ProductWrite): Promise<AdminResult<{ productCode: string }>> {
  const blocked = guardWrite(); if (blocked) return blocked;
  assertCents(input.basePriceCents, ...input.tiers.map(t=>t.unitPriceCents), ...input.options.map(o=>o.priceDeltaCents));
  const c = createSupabaseServiceClient()!;
  const { error } = await c.from('products')
    .update({ base_price_cents: input.basePriceCents, min_qty: input.minQty, qty_step: input.qtyStep, max_qty: input.maxQty })
    .eq('product_code', input.productCode);
  if (error) return { ok:false, reason:'unconfigured', message:error.message };
  // (translation/tier/option upserts follow the same guarded path; wired with admin auth.)
  return { ok:true, data:{ productCode: input.productCode } };
}
