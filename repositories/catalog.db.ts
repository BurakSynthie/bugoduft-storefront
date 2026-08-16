// Supabase-backed reads. Same shapes as repositories/catalog.ts (seed default),
// so future UI can switch data source without scattering queries in components.
// Throws when Supabase is expected but unconfigured — never silently returns fake data.
import type { Locale } from '@/i18n/config';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { supabaseEnv } from '@/lib/supabase/env';
import type { ProductView } from './catalog';

function db() {
  const c = createSupabaseServerClient();
  if (!c) throw new Error('Supabase not configured: cannot read catalog from database.');
  return c;
}
// cms-media is a public bucket → deterministic public URL, no client needed.
const CMS = 'cms-media';
function mediaUrl(path: string | null | undefined): string | null {
  return path ? `${supabaseEnv.url}/storage/v1/object/public/${CMS}/${path}` : null;
}
const MEDIA_SELECT = `cover:cover_media_id(storage_path),video:video_media_id(storage_path),poster:poster_media_id(storage_path),product_media(role,sort_order,media(storage_path))`;
function readMedia(p: any) {
  const gallery = (p.product_media ?? [])
    .filter((r: any) => r.role === 'gallery')
    .sort((a: any, b: any) => a.sort_order - b.sort_order)
    .map((r: any) => mediaUrl(r.media?.storage_path)).filter(Boolean) as string[];
  return { coverImage: mediaUrl(p.cover?.storage_path), gallery,
    video: mediaUrl(p.video?.storage_path), poster: mediaUrl(p.poster?.storage_path) };
}
const priceFrom = (base: number, tiers: { unit_price_cents: number }[]) =>
  Math.min(base, ...(tiers.length ? tiers.map(t => t.unit_price_cents) : [base]));

export async function listProductsDb(locale: Locale): Promise<ProductView[]> {
  const { data, error } = await db()
    .from('products')
    .select(`id, product_code, group_id, base_price_cents, currency, min_qty, max_qty, qty_step,
      collections!inner(code),
      product_translations!inner(locale,name,slug,h1,short_desc,long_desc,seo_title,seo_description),
      product_price_tiers(min_qty,unit_price_cents),
      product_options(key,label_de,price_delta_cents,sort_order),
      product_scents(scents(code)), ${MEDIA_SELECT}`)
    .eq('is_active', true)
    .eq('product_translations.locale', locale);
  if (error) throw error;
  return (data ?? []).map((p: any) => mapProduct(p));
}

export async function getProductBySlugDb(locale: Locale, slug: string): Promise<ProductView | null> {
  const { data, error } = await db()
    .from('product_translations')
    .select(`product_id, name, slug, h1, short_desc, long_desc, seo_title, seo_description,
      products!inner(id, product_code, group_id, base_price_cents, currency, min_qty, max_qty, qty_step, is_active,
        collections!inner(code),
        product_price_tiers(min_qty,unit_price_cents),
        product_options(key,label_de,price_delta_cents,sort_order),
        product_scents(scents(code)), ${MEDIA_SELECT})`)
    .eq('locale', locale).eq('slug', slug).maybeSingle();
  if (error) throw error;
  if (!data || !(data as any).products?.is_active) return null;
  const p: any = (data as any).products;
  return mapProduct({ ...p, product_translations: [{ locale, name:(data as any).name, slug:(data as any).slug,
    h1:(data as any).h1, short_desc:(data as any).short_desc, long_desc:(data as any).long_desc,
    seo_title:(data as any).seo_title, seo_description:(data as any).seo_description }] });
}

function mapProduct(p: any): ProductView {
  const t = (p.product_translations ?? [])[0] ?? {};
  const tiers = (p.product_price_tiers ?? []) as { min_qty:number; unit_price_cents:number }[];
  return {
    id: p.id, code: p.product_code, collectionCode: p.collections?.code ?? '', groupId: p.group_id,
    name: t.name, slug: t.slug, h1: t.h1, shortDesc: t.short_desc, longDesc: t.long_desc,
    seo: { title: t.seo_title, description: t.seo_description },
    basePriceCents: p.base_price_cents, currency: p.currency, priceFromCents: priceFrom(p.base_price_cents, tiers),
    minQty: p.min_qty, maxQty: p.max_qty, qtyStep: p.qty_step,
    tiers: tiers.map(x => ({ minQty:x.min_qty, unitPriceCents:x.unit_price_cents })),
    options: (p.product_options ?? []).sort((a:any,b:any)=>a.sort_order-b.sort_order)
      .map((o:any)=>({ key:o.key, labelDe:o.label_de, priceDeltaCents:o.price_delta_cents })),
    scentCodes: (p.product_scents ?? []).map((r:any)=> r.scents?.code).filter(Boolean),
    ...readMedia(p), coverAlt: null,
  };
}

export async function listCollectionsDb(locale: Locale) {
  const { data, error } = await db()
    .from('collections')
    .select(`code, group_id, sort_order,
      collection_translations!inner(locale,name,slug,description),
      products(is_active, base_price_cents, product_price_tiers(unit_price_cents),
        cover:cover_media_id(storage_path), product_translations(locale,slug))`)
    .eq('is_active', true).eq('collection_translations.locale', locale).order('sort_order');
  if (error) throw error;
  return (data ?? []).map((c: any) => {
    const tr = c.collection_translations[0];
    const prod = (c.products ?? []).find((p: any) => p.is_active);
    const ptr = prod?.product_translations?.find((x: any) => x.locale === locale);
    return { code:c.code, groupId:c.group_id, name:tr.name, slug:tr.slug, description:tr.description,
      priceFromCents: prod ? priceFrom(prod.base_price_cents, prod.product_price_tiers ?? []) : null,
      productSlug: ptr?.slug ?? null, coverImage: mediaUrl(prod?.cover?.storage_path) };
  });
}

export async function listScentsDb(locale: Locale) {
  const { data, error } = await db()
    .from('scents').select(`code, category, scent_translations!inner(locale,name,description)`)
    .eq('is_active', true).eq('scent_translations.locale', locale);
  if (error) throw error;
  return (data ?? []).map((s: any) => ({ code:s.code, category:s.category,
    name:s.scent_translations[0].name, description:s.scent_translations[0].description }));
}
