'use server';
import { revalidatePath } from 'next/cache';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { getAdminUser } from '@/lib/supabase/admin-auth';
import { isSupabaseConfigured } from '@/lib/supabase/env';
import { CMS_BUCKET } from '@/lib/media/types';
import { locales, type Locale } from '@/i18n/config';
import { itemPath } from '@/lib/routing';
import { validateTiers, validateQtyRules, validateTierCoverage } from '@/lib/pricing/tier-input';

export type MediaRef = { id: string; url: string; type: 'image' | 'video' };
export type ProductTr = {
  name: string; slug: string; h1: string; shortDesc: string; longDesc: string;
  features: string[]; useCase: string; productionInfo: string; deliveryInfo: string;
  moqText: string; badge: string; seoTitle: string; seoDescription: string;
  promoBadge: string; coverAlt: string;
};
export type ProductTier = { minQty: number; ratePer1000Cents: number; badgeDe: string; badgeEn: string; badgeFr: string; isActive: boolean };
export type EditableProduct = {
  id: string; productCode: string; collectionCode: string; currency: string;
  basePriceCents: number; minQty: number; qtyStep: number; maxQty: number;
  isActive: boolean; sortOrder: number;
  compareAtCents: number | null; promoEnabled: boolean; promoStart: string | null; promoEnd: string | null;
  cover: MediaRef | null; video: MediaRef | null; poster: MediaRef | null; gallery: MediaRef[];
  tiers: ProductTier[];
  tr: Record<Locale, ProductTr>;
};

export type SaveResult =
  | { ok: true }
  | { ok: false; message: string };

const emptyTr = (): ProductTr => ({
  name:'', slug:'', h1:'', shortDesc:'', longDesc:'', features:[], useCase:'', productionInfo:'',
  deliveryInfo:'', moqText:'', badge:'', seoTitle:'', seoDescription:'', promoBadge:'', coverAlt:'',
});

function pubUrl(sb: any, path: string | null): string | null {
  return path ? sb.storage.from(CMS_BUCKET).getPublicUrl(path).data.publicUrl : null;
}
function mediaRef(sb: any, m: any): MediaRef | null {
  if (!m) return null;
  const url = pubUrl(sb, m.storage_path);
  return url ? { id: m.id, url, type: m.media_type } : null;
}

// DB load for the editor, keyed by the stable business product_code (e.g. BUGO-STD),
// NOT the seed id — the seed id ("p-standard") is never a UUID and must never be sent
// to a uuid column. Returns null when unconfigured/absent so the caller falls back to seed.
export async function loadProduct(productCode: string): Promise<EditableProduct | null> {
  if (!isSupabaseConfigured()) return null;
  const sb = createSupabaseServerClient();
  if (!sb) return null;
  const { data: p } = await sb.from('products')
    .select(`id, product_code, base_price_cents, currency, min_qty, max_qty, qty_step, is_active, sort_order,
      cover_media_id, video_media_id, poster_media_id,
      compare_at_cents, promo_enabled, promo_start, promo_end,
      collections(code),
      product_translations(*),
      cover:cover_media_id(id,storage_path,media_type),
      video:video_media_id(id,storage_path,media_type),
      poster:poster_media_id(id,storage_path,media_type),
      product_media(role,sort_order,media(id,storage_path,media_type))`)
    .eq('product_code', productCode).maybeSingle();
  if (!p) return null;

  const tr = {} as Record<Locale, ProductTr>;
  for (const l of locales) {
    const row = (p.product_translations ?? []).find((t: any) => t.locale === l);
    tr[l] = row ? {
      name:row.name ?? '', slug:row.slug ?? '', h1:row.h1 ?? '', shortDesc:row.short_desc ?? '',
      longDesc:row.long_desc ?? '', features:row.features ?? [], useCase:row.use_case ?? '',
      productionInfo:row.production_info ?? '', deliveryInfo:row.delivery_info ?? '', moqText:row.moq_text ?? '',
      badge:row.badge ?? '', seoTitle:row.seo_title ?? '', seoDescription:row.seo_description ?? '',
      promoBadge:row.promo_badge ?? '', coverAlt:'',
    } : emptyTr();
  }
  const gallery = (p.product_media ?? [])
    .filter((r: any) => r.role === 'gallery')
    .sort((a: any, b: any) => a.sort_order - b.sort_order)
    .map((r: any) => mediaRef(sb, r.media)).filter(Boolean) as MediaRef[];

  const { data: tierRows } = await sb.from('product_price_tiers')
    .select('min_qty, unit_price_cents, badge_de, badge_en, badge_fr, is_active').eq('product_id', p.id);
  const tiers: ProductTier[] = (tierRows ?? [])
    .map((t: any) => ({ minQty: t.min_qty, ratePer1000Cents: t.unit_price_cents,
      badgeDe: t.badge_de ?? '', badgeEn: t.badge_en ?? '', badgeFr: t.badge_fr ?? '', isActive: t.is_active !== false }))
    .sort((a, b) => a.minQty - b.minQty);

  return {
    id: p.id, productCode: p.product_code, collectionCode: (p as any).collections?.code ?? '',
    currency: p.currency, basePriceCents: p.base_price_cents, minQty: p.min_qty, qtyStep: p.qty_step,
    maxQty: p.max_qty, isActive: p.is_active, sortOrder: p.sort_order ?? 0,
    compareAtCents: (p as any).compare_at_cents ?? null, promoEnabled: (p as any).promo_enabled ?? false,
    promoStart: (p as any).promo_start ?? null, promoEnd: (p as any).promo_end ?? null,
    cover: mediaRef(sb, (p as any).cover), video: mediaRef(sb, (p as any).video), poster: mediaRef(sb, (p as any).poster),
    gallery, tiers, tr,
  };
}

export type ProductSaveInput = {
  productCode: string;
  isActive: boolean; sortOrder: number;
  basePriceCents: number; minQty: number; qtyStep: number; maxQty: number;
  compareAtCents: number | null; promoEnabled: boolean; promoStart: string | null; promoEnd: string | null;
  coverId: string | null; videoId: string | null; posterId: string | null; galleryIds: string[];
  tiers: ProductTier[];
  tr: Record<Locale, ProductTr>;
};

// Persists product content to Supabase. Admin-gated (RLS enforces is_admin()).
// Resolves the real products.id UUID from the stable product_code so business ids
// like "p-standard" are never passed into uuid columns. Compare-at is display-only.
export async function saveProduct(input: ProductSaveInput): Promise<SaveResult> {
  const admin = await getAdminUser();
  if (!admin) return { ok: false, message: 'Yetkisiz.' };
  const sb = createSupabaseServerClient();
  if (!sb) return { ok: false, message: 'Supabase yapılandırılmadı.' };

  for (const v of [input.basePriceCents, input.minQty, input.qtyStep, input.maxQty])
    if (!Number.isInteger(v) || v < 0) return { ok: false, message: 'Sayısal alanlar geçersiz.' };
  if (input.compareAtCents != null && (!Number.isInteger(input.compareAtCents) || input.compareAtCents < 0))
    return { ok: false, message: 'Referans fiyat geçersiz.' };
  for (const l of locales) if (!input.tr[l].name.trim() || !input.tr[l].slug.trim())
    return { ok: false, message: `Ad ve slug zorunlu (${l.toUpperCase()}).` };

  // §HIGH-6 / §HIGH-7 — validate ALL remaining input (quantity envelope + price tiers) BEFORE
  // any DB mutation, so a bad quantity rule or a duplicate/out-of-range tier can never leave the
  // product half-written (products.update + translations + gallery already committed). The
  // per-product envelope must align to the canonical 1.000-block grid that the storefront,
  // server pricing and the configurations.quantity DB CHECK all share.
  const qtyCheck = validateQtyRules({ minQty: input.minQty, maxQty: input.maxQty, qtyStep: input.qtyStep });
  if (!qtyCheck.ok) return { ok: false, message: qtyCheck.error };
  const tiersCheck = validateTiers(input.tiers ?? []);
  if (!tiersCheck.ok) return { ok: false, message: tiersCheck.error };
  const cleanTiers = tiersCheck.tiers;
  // §P0/HIGH-12 TIER COVERAGE INVARIANT: refuse to save a product whose min_qty has no ACTIVE
  // covering tier — otherwise the product would be unpriceable (pickTier would return null / the
  // old code would mis-price at a bulk rate). Validated here AND re-checked inside the RPC.
  const coverage = validateTierCoverage(cleanTiers, input.minQty);
  if (!coverage.ok) return { ok: false, message: coverage.error };

  // §HIGH-10 ATOMICITY: the entire multi-table save (product core + translations + gallery +
  // tiers) runs as ONE Postgres transaction via the admin_save_product() RPC (migration 0022).
  // Any failure inside rolls the WHOLE operation back — an admin Save either commits every
  // requested change or none. The RPC is SECURITY DEFINER but verifies public.is_admin() and has
  // a locked search_path, so it never widens the caller's privileges. Every DB error is surfaced.
  const productPayload = {
    is_active: input.isActive, sort_order: input.sortOrder,
    base_price_cents: input.basePriceCents, min_qty: input.minQty, qty_step: input.qtyStep, max_qty: input.maxQty,
    compare_at_cents: input.compareAtCents, promo_enabled: input.promoEnabled,
    promo_start: input.promoStart, promo_end: input.promoEnd,
    cover_media_id: input.coverId, video_media_id: input.videoId, poster_media_id: input.posterId,
  };
  const translationsPayload = locales.map(l => ({
    locale: l,
    name: input.tr[l].name, slug: input.tr[l].slug, h1: input.tr[l].h1,
    short_desc: input.tr[l].shortDesc, long_desc: input.tr[l].longDesc,
    features: input.tr[l].features, use_case: input.tr[l].useCase,
    production_info: input.tr[l].productionInfo, delivery_info: input.tr[l].deliveryInfo,
    moq_text: input.tr[l].moqText, badge: input.tr[l].badge, promo_badge: input.tr[l].promoBadge,
    seo_title: input.tr[l].seoTitle, seo_description: input.tr[l].seoDescription,
  }));
  const tiersPayload = cleanTiers.map((t, i) => ({
    min_qty: t.minQty, unit_price_cents: t.ratePer1000Cents,
    badge_de: t.badgeDe || null, badge_en: t.badgeEn || null, badge_fr: t.badgeFr || null,
    is_active: t.isActive, sort_order: i,
  }));

  const { error: rpcErr } = await sb.rpc('admin_save_product', {
    p_product_code: input.productCode,
    p_product: productPayload,
    p_translations: translationsPayload,
    p_gallery_ids: input.galleryIds,
    p_tiers: tiersPayload,
  });
  if (rpcErr) {
    // Map the two domain raises to friendly Turkish; surface anything else verbatim.
    const msg = rpcErr.message || 'Kayıt başarısız.';
    if (/product_not_found/.test(msg)) return { ok: false, message: `Ürün bulunamadı: ${input.productCode}` };
    if (/not_admin/.test(msg)) return { ok: false, message: 'Yetkisiz.' };
    if (/no_active_tier_covers_min_qty/.test(msg)) return { ok: false, message: 'Ürünün minimum adedi için aktif bir fiyat kademesi tanımlanmalıdır.' };
    if (/invalid_qty_rules/.test(msg)) return { ok: false, message: 'Adet kuralları 1.000 ile 100.000 arasında, 1.000’in katı ve (maks − min) ÷ adım tam sayı olmalıdır.' };
    return { ok: false, message: msg };
  }

  for (const l of locales) {
    revalidatePath(itemPath('products', l, input.tr[l].slug));
    revalidatePath(`/${l}`);
  }
  return { ok: true };
}
