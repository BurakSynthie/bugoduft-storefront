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

// Client-supplied config (untrusted). Prices are IGNORED and recomputed server-side.
export type IncomingConfig = {
  configId: string; locale: Locale;
  collectionCode: string; scentCode: string | null; scentCode2?: string | null;
  intensity: 'normal' | 'intense'; shape: string; quantity: number;
  frontInstructions: string; sameBackAsFront: boolean; backInstructions: string;
  designMode?: 'bugo_creates' | 'ready_file';
};
export type Priced = { ok: true; productId: string; productCode: string;
    basePriceCents: number; unitRateCents: number; surchargeCents: number; totalPriceCents: number;
    baseTotalCents: number; savingsCents: number; freeSampleSet: boolean; freeSampleSource: string | null }
  | { ok: false; error: string };

const SHAPE_IDS = new Set(SHAPES.map(s => s.id));

// DB tiers (admin-managed) with seed fallback. rate = unit_price_cents (per 1,000).
async function tiersFor(productCode: string, seedTiers: PriceTier[]): Promise<PriceTier[]> {
  if (!isSupabaseConfigured()) return seedTiers;
  const c = createSupabaseServiceClient();
  if (!c) return seedTiers;
  try {
    const { data: prod } = await c.from('products').select('id').eq('product_code', productCode).maybeSingle();
    if (!prod) return seedTiers;
    const { data } = await c.from('product_price_tiers')
      .select('min_qty, unit_price_cents, is_active').eq('product_id', prod.id);
    const rows = (data ?? []).filter((t: any) => t.is_active !== false);
    if (!rows.length) return seedTiers;
    return rows.map((t: any) => ({ minQty: t.min_qty, ratePer1000Cents: t.unit_price_cents }));
  } catch { return seedTiers; }
}

// Server truth: recompute price from approved catalog + tiers; reject invalid combos.
export async function validateAndPrice(c: IncomingConfig): Promise<Priced> {
  const products = listProducts(c.locale);
  const p = products.find(x => x.collectionCode === c.collectionCode);
  if (!p) return { ok:false, error:'invalid_collection' };
  if (validateQuantity(c.quantity, { min:1000, max:100000, step:1000 })) return { ok:false, error:'invalid_quantity' };
  if (!c.scentCode || !p.scentCodes.includes(c.scentCode)) return { ok:false, error:'invalid_scent' };
  if (c.scentCode2) {
    if (!p.scentCodes.includes(c.scentCode2)) return { ok:false, error:'invalid_scent2' };
    if (c.scentCode2 === c.scentCode) return { ok:false, error:'duplicate_scent' };
  }
  if (!SHAPE_IDS.has(c.shape as any)) return { ok:false, error:'invalid_shape' };
  if (c.intensity !== 'normal' && c.intensity !== 'intense') return { ok:false, error:'invalid_intensity' };

  const seedTiers: PriceTier[] = (p.tiers.length ? p.tiers : [{ minQty: p.minQty, unitPriceCents: p.basePriceCents }])
    .map(t => ({ minQty: t.minQty, ratePer1000Cents: t.unitPriceCents }));
  const tiers = await tiersFor(p.code, seedTiers);
  const q = priceQuantity(tiers, c.quantity);

  const surchargeCents = c.intensity === 'intense' ? INTENSE_SURCHARGE_CENTS : 0;
  const settings = await getSettings();
  const freeSampleSet = settings.sample.enabled && c.quantity >= settings.sample.threshold;

  return { ok:true, productId: p.id, productCode: p.code,
    basePriceCents: q.ratePer1000Cents,        // selected per-1,000 rate (keeps "ab X/1.000" display)
    unitRateCents: q.ratePer1000Cents,
    surchargeCents,
    totalPriceCents: q.totalCents + surchargeCents,   // FULL authoritative order total
    baseTotalCents: q.baseTotalCents, savingsCents: q.savingsCents,
    freeSampleSet, freeSampleSource: freeSampleSet ? 'free_5k' : null };
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
  };
  const { error } = await c.from('configurations').upsert(row, { onConflict: 'id' });
  if (error) return { ok:false, message: error.message };
  return { ok:true };
}
