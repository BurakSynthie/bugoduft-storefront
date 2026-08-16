import type { Locale } from '@/i18n/config';

export type Seo = { title: string; description: string; ogTitle?: string; ogDescription?: string; ogImage?: string };
export type Tr<T> = Record<Locale, T>;                 // DE/EN/FR = separate persisted rows

export type CollectionSeed = {
  code: 'STANDARD' | 'PREMIUM' | 'DELUXE' | 'VIP';
  groupId: string;                                     // shared across locales -> drives hreflang
  isActive: boolean; sortOrder: number;
  tr: Tr<{ name: string; slug: string; description: string; seo: Seo }>;
};

export type PriceTier = { minQty: number; unitPriceCents: number };
export type ProductOption = { key: string; labelDe: string; priceDeltaCents: number };

// Optional CMS presentation media. Populated from the DB in a later phase; when
// absent the storefront uses tasteful gradient fallbacks (no fabricated assets).
export type ProductMedia = {
  cover?: string; gallery?: string[]; video?: string; poster?: string;
  alt?: Partial<Tr<string>>;
};

export type ProductSeed = {
  id: string; productCode: string; collectionCode: CollectionSeed['code'];
  groupId: string; isActive: boolean;
  basePriceCents: number; currency: 'EUR';
  minQty: number; maxQty: number; qtyStep: number;
  tiers: PriceTier[]; options: ProductOption[]; scentCodes: string[];
  media?: ProductMedia;
  tr: Tr<{ name: string; slug: string; h1: string; shortDesc: string; longDesc: string; seo: Seo }>;
};

export type ScentSeed = {
  code: string; category: 'frisch' | 'fruchtig' | 'suess' | 'elegant' | 'intensiv';
  isActive: boolean;
  tr: Tr<{ name: string; description: string }>;
};

export type IndustrySeed = {
  key: string; groupId: string;
  tr: Tr<{ name: string; slug: string; headline: string; body: string; seo: Seo }>;
};

export type FaqItem = { tr: Tr<{ q: string; a: string }> };
