// Seed-backed repository. Same function surface a Supabase repository will expose,
// so P3 swaps the data source without touching callers.
import type { Locale } from '@/i18n/config';
import { collections } from '@/data/seed/collections';
import { products } from '@/data/seed/products';
import { scents } from '@/data/seed/scents';
import { industries } from '@/data/seed/industries';
import type { ProductSeed, ScentSeed } from '@/data/types';
import { storefrontFromCents } from '@/lib/pricing/tiers';

export type ProductView = {
  id: string; code: string; collectionCode: string; groupId: string;
  name: string; slug: string; h1: string; shortDesc: string; longDesc: string;
  seo: ProductSeed['tr']['de']['seo'];
  basePriceCents: number; currency: 'EUR'; priceFromCents: number;
  minQty: number; maxQty: number; qtyStep: number;
  tiers: ProductSeed['tiers']; options: ProductSeed['options']; scentCodes: string[];
  coverImage: string | null; gallery: string[]; galleryAlt: (string | null)[]; video: string | null; poster: string | null; coverAlt: string | null;
  badge: string | null; features: string[]; useCase: string | null;
  productionInfo: string | null; deliveryInfo: string | null; moqText: string | null;
  compareAtCents: number | null; promoActive: boolean; promoBadge: string | null;
};

// Storefront starting ("ab") price is the lowest purchasable TOTAL across the supplied tiers.
// Uses the same centralized display-only rule as the DB reader so the two can never drift.
function priceFrom(p: ProductSeed) {
  return storefrontFromCents(p.tiers.map(t => ({ minQty: t.minQty, ratePer1000Cents: t.unitPriceCents })), p.minQty, p.basePriceCents);
}

export function toProductView(p: ProductSeed, locale: Locale): ProductView {
  const t = p.tr[locale];
  return { id:p.id, code:p.productCode, collectionCode:p.collectionCode, groupId:p.groupId,
    name:t.name, slug:t.slug, h1:t.h1, shortDesc:t.shortDesc, longDesc:t.longDesc, seo:t.seo,
    basePriceCents:p.basePriceCents, currency:p.currency, priceFromCents:priceFrom(p),
    minQty:p.minQty, maxQty:p.maxQty, qtyStep:p.qtyStep, tiers:p.tiers, options:p.options, scentCodes:p.scentCodes,
    coverImage:p.media?.cover ?? null, gallery:p.media?.gallery ?? [],
    galleryAlt:(p.media?.gallery ?? []).map(() => null),   // seed gallery carries no per-image ALT
    video:p.media?.video ?? null,
    poster:p.media?.poster ?? null, coverAlt:p.media?.alt?.[locale] ?? null,
    badge:null, features:[], useCase:null, productionInfo:null, deliveryInfo:null, moqText:null,
    compareAtCents:null, promoActive:false, promoBadge:null };
}

export function listProducts(locale: Locale): ProductView[] {
  return products.filter(p => p.isActive).map(p => toProductView(p, locale));
}
export function getProductBySlug(locale: Locale, slug: string): ProductView | null {
  const p = products.find(x => x.isActive && x.tr[locale].slug === slug);
  return p ? toProductView(p, locale) : null;
}
export function getProductById(id: string): ProductSeed | null { return products.find(p => p.id === id) ?? null; }

export function listCollections(locale: Locale) {
  return collections.filter(c => c.isActive).sort((a,b)=>a.sortOrder-b.sortOrder).map(c => {
    const prod = products.find(p => p.collectionCode === c.code && p.isActive);
    return { code:c.code, groupId:c.groupId, name:c.tr[locale].name, slug:c.tr[locale].slug,
      description:c.tr[locale].description,
      priceFromCents: prod ? priceFrom(prod) : null,
      productSlug: prod ? prod.tr[locale].slug : null,
      coverImage: prod?.media?.cover ?? null,
      compareAtCents: null as number | null, promoActive: false };
  });
}

export function listScents(locale: Locale) {
  return scents.filter(s => s.isActive).map((s: ScentSeed) => ({
    code:s.code, category:s.category, name:s.tr[locale].name, description:s.tr[locale].description }));
}
export const scentCategories = ['frisch','fruchtig','suess','elegant','intensiv'] as const;

export function listIndustries(locale: Locale) {
  return industries.map(i => ({ key:i.key, groupId:i.groupId, name:i.tr[locale].name, slug:i.tr[locale].slug,
    headline:i.tr[locale].headline, body:i.tr[locale].body, seo:i.tr[locale].seo }));
}
export function getIndustryBySlug(locale: Locale, slug: string) {
  const i = industries.find(x => x.tr[locale].slug === slug); if (!i) return null;
  return { key:i.key, groupId:i.groupId, name:i.tr[locale].name, slug:i.tr[locale].slug,
    headline:i.tr[locale].headline, body:i.tr[locale].body, seo:i.tr[locale].seo };
}

// --- hreflang / language-switcher alternates (data-driven, never hand-typed) ---
import { itemPath, sectionPath } from '@/lib/routing';
import { locales } from '@/i18n/config';
export function productAlternates(groupId: string): Record<Locale, string> {
  const p = products.find(x => x.groupId === groupId)!;
  return Object.fromEntries(locales.map(l => [l, itemPath('products', l, p.tr[l].slug)])) as Record<Locale,string>;
}
export function industryAlternates(groupId: string): Record<Locale, string> {
  const i = industries.find(x => x.groupId === groupId)!;
  return Object.fromEntries(locales.map(l => [l, itemPath('industries', l, i.tr[l].slug)])) as Record<Locale,string>;
}
export function sectionAlternates(section: Parameters<typeof sectionPath>[0]): Record<Locale, string> {
  return Object.fromEntries(locales.map(l => [l, sectionPath(section, l)])) as Record<Locale,string>;
}
export function homeAlternates(): Record<Locale, string> {
  return Object.fromEntries(locales.map(l => [l, `/${l}`])) as Record<Locale,string>;
}
