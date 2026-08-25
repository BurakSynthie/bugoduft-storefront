// Supabase-backed reads. Same shapes as repositories/catalog.ts (seed default),
// so future UI can switch data source without scattering queries in components.
// Throws when Supabase is expected but unconfigured — never silently returns fake data.
import type { Locale } from '@/i18n/config';
import { itemPath } from '@/lib/routing';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { supabaseEnv } from '@/lib/supabase/env';
import { storefrontFromCents } from '@/lib/pricing/tiers';
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
// §J/§10 also select the localized ALT columns on the cover AND on each gallery media row so
// the storefront can consume locale-specific ALT instead of dropping it.
const MEDIA_SELECT = `cover:cover_media_id(storage_path,alt_de,alt_en,alt_fr),video:video_media_id(storage_path),poster:poster_media_id(storage_path),product_media(role,sort_order,media(storage_path,alt_de,alt_en,alt_fr))`;
function altFor(m: any, locale: Locale): string | null {
  if (!m) return null;
  const alt = locale === 'de' ? m.alt_de : locale === 'en' ? m.alt_en : m.alt_fr;
  return (alt && String(alt).trim()) ? String(alt) : null;
}
function coverAltFor(p: any, locale: Locale): string | null {
  return altFor(p.cover, locale);
}
function readMedia(p: any, locale: Locale) {
  const galleryRows = (p.product_media ?? [])
    .filter((r: any) => r.role === 'gallery')
    .sort((a: any, b: any) => a.sort_order - b.sort_order)
    .map((r: any) => ({ url: mediaUrl(r.media?.storage_path), alt: altFor(r.media, locale) }))
    .filter((x: any) => x.url);
  return { coverImage: mediaUrl(p.cover?.storage_path),
    gallery: galleryRows.map((x: any) => x.url) as string[],
    galleryAlt: galleryRows.map((x: any) => x.alt) as (string | null)[],
    video: mediaUrl(p.video?.storage_path), poster: mediaUrl(p.poster?.storage_path) };
}
// Storefront starting ("ab") price is the lowest purchasable TOTAL, and §HIGH-5 only ACTIVE
// tiers may influence it. The active-tier filter is intentionally preserved before display pricing.
// Rule centralized in lib/pricing/tiers.
type DbTier = { min_qty: number; unit_price_cents: number; is_active?: boolean };
const activeTiers = (tiers: DbTier[]): DbTier[] => (tiers ?? []).filter(t => t.is_active !== false);
const priceFrom = (base: number, tiers: DbTier[], minQty: number) =>
  storefrontFromCents(activeTiers(tiers).map(t => ({ minQty: t.min_qty, ratePer1000Cents: t.unit_price_cents })), minQty, base);

export async function listProductsDb(locale: Locale): Promise<ProductView[]> {
  const { data, error } = await db()
    .from('products')
    .select(`id, product_code, group_id, base_price_cents, currency, min_qty, max_qty, qty_step,
      compare_at_cents, promo_enabled, promo_start, promo_end,
      collections!inner(code),
      product_translations!inner(locale,name,slug,h1,short_desc,long_desc,seo_title,seo_description,
        features,use_case,production_info,delivery_info,moq_text,badge,promo_badge),
      product_price_tiers(min_qty,unit_price_cents,is_active),
      product_options(key,label_de,price_delta_cents,sort_order),
      product_scents(scents(code)), ${MEDIA_SELECT}`)
    .eq('is_active', true)
    .eq('product_translations.locale', locale);
  if (error) throw error;
  return (data ?? []).map((p: any) => mapProduct(p, locale));
}

export async function getProductBySlugDb(locale: Locale, slug: string): Promise<ProductView | null> {
  const { data, error } = await db()
    .from('product_translations')
    .select(`product_id, name, slug, h1, short_desc, long_desc, seo_title, seo_description,
      features, use_case, production_info, delivery_info, moq_text, badge, promo_badge,
      products!inner(id, product_code, group_id, base_price_cents, currency, min_qty, max_qty, qty_step, is_active,
        compare_at_cents, promo_enabled, promo_start, promo_end,
        collections!inner(code),
        product_price_tiers(min_qty,unit_price_cents,is_active),
        product_options(key,label_de,price_delta_cents,sort_order),
        product_scents(scents(code)), ${MEDIA_SELECT})`)
    .eq('locale', locale).eq('slug', slug).maybeSingle();
  if (error) throw error;
  if (!data || !(data as any).products?.is_active) return null;
  const p: any = (data as any).products;
  return mapProduct({ ...p, product_translations: [{ locale, name:(data as any).name, slug:(data as any).slug,
    h1:(data as any).h1, short_desc:(data as any).short_desc, long_desc:(data as any).long_desc,
    seo_title:(data as any).seo_title, seo_description:(data as any).seo_description,
    features:(data as any).features, use_case:(data as any).use_case, production_info:(data as any).production_info,
    delivery_info:(data as any).delivery_info, moq_text:(data as any).moq_text, badge:(data as any).badge,
    promo_badge:(data as any).promo_badge }] }, locale);
}

function promoIsActive(p: any): boolean {
  if (!p.promo_enabled || p.compare_at_cents == null) return false;
  if (p.compare_at_cents <= p.base_price_cents) return false;   // reference must exceed current price
  const now = Date.now();
  if (p.promo_start && new Date(p.promo_start).getTime() > now) return false;
  if (p.promo_end && new Date(p.promo_end).getTime() < now) return false;   // expired → no display
  return true;
}
function mapProduct(p: any, locale: Locale): ProductView {
  const t = (p.product_translations ?? [])[0] ?? {};
  const rawTiers = (p.product_price_tiers ?? []) as DbTier[];
  const tiers = activeTiers(rawTiers);   // §HIGH-5 configurator/display see only active tiers
  const active = promoIsActive(p);
  return {
    id: p.id, code: p.product_code, collectionCode: p.collections?.code ?? '', groupId: p.group_id,
    name: t.name, slug: t.slug, h1: t.h1, shortDesc: t.short_desc, longDesc: t.long_desc,
    seo: { title: t.seo_title, description: t.seo_description },
    basePriceCents: p.base_price_cents, currency: p.currency, priceFromCents: priceFrom(p.base_price_cents, rawTiers, p.min_qty),
    minQty: p.min_qty, maxQty: p.max_qty, qtyStep: p.qty_step,
    tiers: tiers.map(x => ({ minQty:x.min_qty, unitPriceCents:x.unit_price_cents })),
    options: (p.product_options ?? []).sort((a:any,b:any)=>a.sort_order-b.sort_order)
      .map((o:any)=>({ key:o.key, labelDe:o.label_de, priceDeltaCents:o.price_delta_cents })),
    scentCodes: (p.product_scents ?? []).map((r:any)=> r.scents?.code).filter(Boolean),
    ...readMedia(p, locale), coverAlt: coverAltFor(p, locale),
    badge: t.badge ?? null, features: t.features ?? [], useCase: t.use_case ?? null,
    productionInfo: t.production_info ?? null, deliveryInfo: t.delivery_info ?? null, moqText: t.moq_text ?? null,
    compareAtCents: active ? p.compare_at_cents : null, promoActive: active, promoBadge: active ? (t.promo_badge ?? null) : null,
  };
}

export async function listCollectionsDb(locale: Locale) {
  const { data, error } = await db()
    .from('collections')
    .select(`code, group_id, sort_order,
      collection_translations!inner(locale,name,slug,description),
      products(is_active, base_price_cents, min_qty, compare_at_cents, promo_enabled, promo_start, promo_end,
        product_price_tiers(min_qty, unit_price_cents, is_active),
        cover:cover_media_id(storage_path), product_translations(locale,slug))`)
    .eq('is_active', true).eq('collection_translations.locale', locale).order('sort_order');
  if (error) throw error;
  return (data ?? []).map((c: any) => {
    const tr = c.collection_translations[0];
    const prod = (c.products ?? []).find((p: any) => p.is_active);
    const ptr = prod?.product_translations?.find((x: any) => x.locale === locale);
    const active = prod ? promoIsActive(prod) : false;
    return { code:c.code, groupId:c.group_id, name:tr.name, slug:tr.slug, description:tr.description,
      priceFromCents: prod ? priceFrom(prod.base_price_cents, prod.product_price_tiers ?? [], prod.min_qty) : null,
      productSlug: ptr?.slug ?? null, coverImage: mediaUrl(prod?.cover?.storage_path),
      compareAtCents: active ? prod.compare_at_cents : null, promoActive: active };
  });
}

export async function listScentsDb(locale: Locale) {
  const { data, error } = await db()
    .from('scents').select(`code, category, sort_order, scent_translations!inner(locale,name,description)`)
    .eq('is_active', true).eq('scent_translations.locale', locale).order('sort_order');
  if (error) throw error;
  return (data ?? []).map((s: any) => ({ code:s.code, category:s.category,
    name:s.scent_translations[0].name, description:s.scent_translations[0].description }));
}

// Per-locale product slugs for hreflang, sourced from the DB (admin may have
// changed slugs). Falls back to the provided seed map on miss/error.
export async function productAlternatesDb(groupId: string, fallback: Record<Locale, string>): Promise<Record<Locale, string>> {
  const { data, error } = await db()
    .from('product_translations')
    .select('locale, slug, products!inner(group_id)')
    .eq('products.group_id', groupId);
  if (error || !data?.length) return fallback;
  const out = { ...fallback };
  for (const r of data as any[]) out[r.locale as Locale] = itemPath('products', r.locale, r.slug);
  return out;
}
