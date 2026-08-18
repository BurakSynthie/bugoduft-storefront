import 'server-only';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { isSupabaseConfigured } from '@/lib/supabase/env';
import { locales, type Locale } from '@/i18n/config';

export type SeoRow = {
  id: string; code: string;
  tr: Record<Locale, { title: string; description: string }>;
};
// Per-product SEO title/description for every locale (for length + missing checks).
export async function seoAudit(): Promise<SeoRow[]> {
  if (!isSupabaseConfigured()) return [];
  const sb = createSupabaseServerClient();
  if (!sb) return [];
  const { data } = await sb.from('products')
    .select('id, product_code, product_translations(locale,seo_title,seo_description)')
    .order('product_code');
  return (data ?? []).map((p: any) => {
    const tr = Object.fromEntries(locales.map(l => [l, { title:'', description:'' }])) as SeoRow['tr'];
    for (const l of locales) {
      const row = (p.product_translations ?? []).find((t: any) => t.locale === l);
      if (row) tr[l] = { title: row.seo_title ?? '', description: row.seo_description ?? '' };
    }
    return { id: p.id, code: p.product_code, tr };
  });
}

export type TransGroup = { kind: string; items: { id: string; code: string; present: Record<Locale, boolean> }[] };
// Presence of the primary localized name across DE/EN/FR for products/collections/scents.
export async function translationAudit(): Promise<TransGroup[]> {
  if (!isSupabaseConfigured()) return [];
  const sb = createSupabaseServerClient();
  if (!sb) return [];
  const has = (rows: any[], l: Locale) => !!rows?.find((t: any) => t.locale === l && (t.name ?? '').trim());

  const [prods, colls, scts] = await Promise.all([
    sb.from('products').select('id, product_code, product_translations(locale,name)').order('product_code'),
    sb.from('collections').select('id, code, collection_translations(locale,name)').order('sort_order'),
    sb.from('scents').select('id, code, scent_translations(locale,name)').order('sort_order'),
  ]);
  const map = (rows: any[], trKey: string, codeKey: string) => (rows ?? []).map((r: any) => ({
    id: r.id, code: r[codeKey],
    present: Object.fromEntries(locales.map(l => [l, has(r[trKey], l)])) as Record<Locale, boolean>,
  }));
  return [
    { kind: 'Ürünler', items: map(prods.data ?? [], 'product_translations', 'product_code') },
    { kind: 'Koleksiyonlar', items: map(colls.data ?? [], 'collection_translations', 'code') },
    { kind: 'Kokular', items: map(scts.data ?? [], 'scent_translations', 'code') },
  ];
}
