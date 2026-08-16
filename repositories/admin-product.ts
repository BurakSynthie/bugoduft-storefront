'use server';
import { revalidatePath } from 'next/cache';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { getAdminUser } from '@/lib/supabase/admin-auth';
import { isSupabaseConfigured } from '@/lib/supabase/env';
import { CMS_BUCKET } from '@/lib/media/types';
import { locales, type Locale } from '@/i18n/config';
import { itemPath } from '@/lib/routing';

export type MediaRef = { id: string; url: string; type: 'image' | 'video' };
export type ProductTr = {
  name: string; slug: string; h1: string; shortDesc: string; longDesc: string;
  features: string[]; useCase: string; productionInfo: string; deliveryInfo: string;
  moqText: string; badge: string; seoTitle: string; seoDescription: string;
  coverAlt: string;
};
export type EditableProduct = {
  id: string; productCode: string; collectionCode: string; currency: string;
  basePriceCents: number; minQty: number; qtyStep: number; maxQty: number;
  isActive: boolean; sortOrder: number;
  cover: MediaRef | null; video: MediaRef | null; poster: MediaRef | null; gallery: MediaRef[];
  tr: Record<Locale, ProductTr>;
};

export type SaveResult =
  | { ok: true }
  | { ok: false; message: string };

const emptyTr = (): ProductTr => ({
  name:'', slug:'', h1:'', shortDesc:'', longDesc:'', features:[], useCase:'', productionInfo:'',
  deliveryInfo:'', moqText:'', badge:'', seoTitle:'', seoDescription:'', coverAlt:'',
});

function pubUrl(sb: any, path: string | null): string | null {
  return path ? sb.storage.from(CMS_BUCKET).getPublicUrl(path).data.publicUrl : null;
}
function mediaRef(sb: any, m: any): MediaRef | null {
  if (!m) return null;
  const url = pubUrl(sb, m.storage_path);
  return url ? { id: m.id, url, type: m.media_type } : null;
}

// DB load for the editor. Returns null when Supabase is unconfigured so the caller
// can fall back to the shipped seed (read-only) — the homepage/product never breaks.
export async function loadProduct(productId: string): Promise<EditableProduct | null> {
  if (!isSupabaseConfigured()) return null;
  const sb = createSupabaseServerClient();
  if (!sb) return null;
  const { data: p } = await sb.from('products')
    .select(`id, product_code, base_price_cents, currency, min_qty, max_qty, qty_step, is_active, sort_order,
      cover_media_id, video_media_id, poster_media_id,
      collections(code),
      product_translations(*),
      cover:cover_media_id(id,storage_path,media_type),
      video:video_media_id(id,storage_path,media_type),
      poster:poster_media_id(id,storage_path,media_type),
      product_media(role,sort_order,media(id,storage_path,media_type))`)
    .eq('id', productId).maybeSingle();
  if (!p) return null;

  const tr = {} as Record<Locale, ProductTr>;
  for (const l of locales) {
    const row = (p.product_translations ?? []).find((t: any) => t.locale === l);
    tr[l] = row ? {
      name:row.name ?? '', slug:row.slug ?? '', h1:row.h1 ?? '', shortDesc:row.short_desc ?? '',
      longDesc:row.long_desc ?? '', features:row.features ?? [], useCase:row.use_case ?? '',
      productionInfo:row.production_info ?? '', deliveryInfo:row.delivery_info ?? '', moqText:row.moq_text ?? '',
      badge:row.badge ?? '', seoTitle:row.seo_title ?? '', seoDescription:row.seo_description ?? '',
      coverAlt:'',
    } : emptyTr();
  }
  const gallery = (p.product_media ?? [])
    .filter((r: any) => r.role === 'gallery')
    .sort((a: any, b: any) => a.sort_order - b.sort_order)
    .map((r: any) => mediaRef(sb, r.media)).filter(Boolean) as MediaRef[];

  return {
    id: p.id, productCode: p.product_code, collectionCode: (p as any).collections?.code ?? '',
    currency: p.currency, basePriceCents: p.base_price_cents, minQty: p.min_qty, qtyStep: p.qty_step,
    maxQty: p.max_qty, isActive: p.is_active, sortOrder: p.sort_order ?? 0,
    cover: mediaRef(sb, (p as any).cover), video: mediaRef(sb, (p as any).video), poster: mediaRef(sb, (p as any).poster),
    gallery, tr,
  };
}

export type ProductSaveInput = {
  id: string;
  isActive: boolean; sortOrder: number;
  basePriceCents: number; minQty: number; qtyStep: number; maxQty: number;
  coverId: string | null; videoId: string | null; posterId: string | null; galleryIds: string[];
  tr: Record<Locale, ProductTr>;
};

// Persists product content to Supabase. Admin-gated (RLS enforces is_admin());
// authoritative pricing stays in cents and is validated as integers. No second
// price source is introduced. Revalidates the affected localized routes.
export async function saveProduct(input: ProductSaveInput): Promise<SaveResult> {
  const admin = await getAdminUser();
  if (!admin) return { ok: false, message: 'Yetkisiz.' };
  const sb = createSupabaseServerClient();
  if (!sb) return { ok: false, message: 'Supabase yapılandırılmadı.' };

  for (const v of [input.basePriceCents, input.minQty, input.qtyStep, input.maxQty])
    if (!Number.isInteger(v) || v < 0) return { ok: false, message: 'Sayısal alanlar geçersiz.' };
  for (const l of locales) if (!input.tr[l].name.trim() || !input.tr[l].slug.trim())
    return { ok: false, message: `Ad ve slug zorunlu (${l.toUpperCase()}).` };

  const upd = await sb.from('products').update({
    is_active: input.isActive, sort_order: input.sortOrder,
    base_price_cents: input.basePriceCents, min_qty: input.minQty, qty_step: input.qtyStep, max_qty: input.maxQty,
    cover_media_id: input.coverId, video_media_id: input.videoId, poster_media_id: input.posterId,
  }).eq('id', input.id);
  if (upd.error) return { ok: false, message: upd.error.message };

  const trRows = locales.map(l => ({
    product_id: input.id, locale: l,
    name: input.tr[l].name, slug: input.tr[l].slug, h1: input.tr[l].h1,
    short_desc: input.tr[l].shortDesc, long_desc: input.tr[l].longDesc,
    features: input.tr[l].features, use_case: input.tr[l].useCase,
    production_info: input.tr[l].productionInfo, delivery_info: input.tr[l].deliveryInfo,
    moq_text: input.tr[l].moqText, badge: input.tr[l].badge,
    seo_title: input.tr[l].seoTitle, seo_description: input.tr[l].seoDescription,
  }));
  const trUp = await sb.from('product_translations').upsert(trRows, { onConflict: 'product_id,locale' });
  if (trUp.error) return { ok: false, message: trUp.error.message };

  await sb.from('product_media').delete().eq('product_id', input.id).eq('role', 'gallery');
  if (input.galleryIds.length) {
    const rows = input.galleryIds.map((mid, i) => ({ product_id: input.id, media_id: mid, role: 'gallery', sort_order: i }));
    const gi = await sb.from('product_media').insert(rows);
    if (gi.error) return { ok: false, message: gi.error.message };
  }

  // reflect changes on the storefront without a redeploy
  for (const l of locales) {
    revalidatePath(itemPath('products', l, input.tr[l].slug));
    revalidatePath(`/${l}`);
  }
  return { ok: true };
}
