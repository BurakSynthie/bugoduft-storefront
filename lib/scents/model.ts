import type { Locale } from '@/i18n/config';
import { locales } from '@/i18n/config';

export const SCENT_CATEGORIES = ['frisch','fruchtig','suess','elegant','intensiv'] as const;
// §P1 commercial catalogue grouping — SEPARATE from the scent-profile `category` above.
// Descriptive only; it does NOT restrict product availability (that lives in product_scents).
export const CATALOG_GROUPS = ['standard','parfum','vip'] as const;
export type CatalogGroup = typeof CATALOG_GROUPS[number];
// The four main products, by collection code. Scent availability (product_scents) is
// edited against these in Admin -> Kokular. This is the AUTHORITATIVE availability that
// checkout validates against — NOT inferred from catalog_group.
export const MAIN_COLLECTIONS = ['STANDARD','PREMIUM','DELUXE','VIP'] as const;
export type MainCollection = typeof MAIN_COLLECTIONS[number];
export type ScentTr = { name: string; description: string };
export type EditableScent = {
  id: string | null;                 // null = new (not yet persisted)
  code: string; category: string; catalogGroup: CatalogGroup | null;
  isActive: boolean; featured: boolean; sortOrder: number;
  availability: string[];            // collection codes this scent is available on
  tr: Record<Locale, ScentTr>;
};
export type ScentResult<T = true> = { ok: true; data: T } | { ok: false; message: string; blockedBy?: string[] };
export const emptyScentTr = (): Record<Locale, ScentTr> =>
  Object.fromEntries(locales.map(l => [l, { name:'', description:'' }])) as Record<Locale, ScentTr>;
