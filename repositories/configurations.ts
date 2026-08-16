import 'server-only';
import type { Locale } from '@/i18n/config';
import { listProducts } from '@/repositories/catalog';
import { validateQuantity } from '@/lib/quantity';
import { INTENSE_SURCHARGE_CENTS } from '@/config/shopify';
import { createSupabaseServiceClient } from '@/lib/supabase/server';
import { isSupabaseConfigured } from '@/lib/supabase/env';
import { SHAPES } from '@/lib/configurator/shapes';

// Client-supplied config (untrusted). Prices are IGNORED and recomputed server-side.
export type IncomingConfig = {
  configId: string; locale: Locale;
  collectionCode: string; scentCode: string | null;
  intensity: 'normal' | 'intense'; shape: string; quantity: number;
  frontInstructions: string; sameBackAsFront: boolean; backInstructions: string;
};
export type Priced = { ok: true; productId: string; productCode: string; basePriceCents: number; surchargeCents: number; totalPriceCents: number }
  | { ok: false; error: string };

const SHAPE_IDS = new Set(SHAPES.map(s => s.id));

// Server truth: recompute price from approved catalog; reject invalid combinations.
export function validateAndPrice(c: IncomingConfig): Priced {
  const products = listProducts(c.locale);
  const p = products.find(x => x.collectionCode === c.collectionCode);
  if (!p) return { ok:false, error:'invalid_collection' };
  if (validateQuantity(c.quantity, { min:1000, max:100000, step:1000 })) return { ok:false, error:'invalid_quantity' };
  if (!c.scentCode || !p.scentCodes.includes(c.scentCode)) return { ok:false, error:'invalid_scent' };
  if (!SHAPE_IDS.has(c.shape as any)) return { ok:false, error:'invalid_shape' };
  if (c.intensity !== 'normal' && c.intensity !== 'intense') return { ok:false, error:'invalid_intensity' };
  const basePriceCents = p.basePriceCents;                       // approved base, ignores client price
  const surchargeCents = c.intensity === 'intense' ? INTENSE_SURCHARGE_CENTS : 0;
  return { ok:true, productId: p.id, productCode: p.code, basePriceCents, surchargeCents, totalPriceCents: basePriceCents + surchargeCents };
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
    quantity: input.quantity, scent_code: input.scentCode, intensity: input.intensity, shape: input.shape,
    front_path: input.frontPath ?? null, front_instructions: input.frontInstructions,
    same_back_as_front: input.sameBackAsFront, back_path: input.backPath ?? null,
    back_instructions: input.sameBackAsFront ? null : input.backInstructions,
    supporting: input.supporting ?? [],
    base_price_cents: input.basePriceCents, surcharge_cents: input.surchargeCents, total_price_cents: input.totalPriceCents,
    status: input.status ?? 'draft', shopify_cart_id: input.shopifyCartId ?? null,
  };
  const { error } = await c.from('configurations').upsert(row, { onConflict: 'id' });
  if (error) return { ok:false, message: error.message };
  return { ok:true };
}
