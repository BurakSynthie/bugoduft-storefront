import 'server-only';
import type { Locale } from '@/i18n/config';
import { isSupabaseConfigured } from '@/lib/supabase/env';
import * as seed from './catalog';
import * as dbq from './catalog.db';
import type { ProductView } from './catalog';

// Storefront reads: prefer live Supabase CMS content, but ALWAYS fall back to the
// shipped seed when unconfigured or on any query error, so the storefront never
// crashes and never shows an empty homepage/product. Admin edits appear here once
// the affected routes are revalidated after save.

export async function getProducts(locale: Locale): Promise<ProductView[]> {
  if (isSupabaseConfigured()) {
    try { const r = await dbq.listProductsDb(locale); if (r.length) return r; } catch {}
  }
  return seed.listProducts(locale);
}

export async function getProductBySlug(locale: Locale, slug: string): Promise<ProductView | null> {
  if (isSupabaseConfigured()) {
    try { const r = await dbq.getProductBySlugDb(locale, slug); if (r) return r; } catch {}
  }
  return seed.getProductBySlug(locale, slug);
}

export async function getCollections(locale: Locale) {
  if (isSupabaseConfigured()) {
    try { const r = await dbq.listCollectionsDb(locale); if (r.length) return r; } catch {}
  }
  return seed.listCollections(locale);
}

export async function getScents(locale: Locale) {
  if (isSupabaseConfigured()) {
    try { const r = await dbq.listScentsDb(locale); if (r.length) return r; } catch {}
  }
  return seed.listScents(locale);
}

// hreflang alternates for a product group — DB slugs first, seed fallback.
export async function getProductAlternates(groupId: string): Promise<Record<Locale, string>> {
  const fallback = seed.productAlternates(groupId);
  if (isSupabaseConfigured()) { try { return await dbq.productAlternatesDb(groupId, fallback); } catch {} }
  return fallback;
}
