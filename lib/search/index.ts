import type { Locale } from '@/i18n/config';
import { listProducts, listCollections, listScents, listIndustries } from '@/repositories/catalog';
import { faq } from '@/data/seed/faq';
import { sectionPath, itemPath, configuratorPath } from '@/lib/routing';

export type SearchKind = 'products' | 'scents' | 'faq' | 'pages';
export type SearchEntry = { kind: SearchKind; title: string; sub?: string; href: string; blob: string };

const norm = (s: string) =>
  s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

// Builds a small in-memory, locale-specific index from the existing seed/catalog
// architecture. DE content is indexed for DE, EN for EN, FR for FR — no leakage.
export function buildIndex(locale: Locale): SearchEntry[] {
  const out: SearchEntry[] = [];

  for (const p of listProducts(locale)) {
    out.push({
      kind: 'products', title: p.name, sub: p.shortDesc,
      href: itemPath('products', locale, p.slug),
      blob: norm(`${p.name} ${p.shortDesc} ${p.longDesc} ${p.collectionCode}`),
    });
  }
  for (const c of listCollections(locale)) {
    if (c.productSlug) continue; // collection already covered by its product
    out.push({ kind: 'products', title: c.name, sub: c.description, href: sectionPath('products', locale), blob: norm(`${c.name} ${c.description}`) });
  }
  for (const s of listScents(locale)) {
    out.push({ kind: 'scents', title: s.name, sub: s.description, href: sectionPath('scents', locale), blob: norm(`${s.name} ${s.description} ${s.category}`) });
  }
  for (const f of faq) {
    const t = f.tr[locale];
    out.push({ kind: 'faq', title: t.q, sub: t.a, href: `/${locale}#faq`, blob: norm(`${t.q} ${t.a}`) });
  }
  for (const i of listIndustries(locale)) {
    out.push({ kind: 'pages', title: i.headline, sub: i.body, href: itemPath('industries', locale, i.slug), blob: norm(`${i.name} ${i.headline} ${i.body}`) });
  }
  // key static pages
  const pages: { title: string; href: string; blob: string }[] = [
    { title: locale === 'de' ? 'Konfigurator' : locale === 'en' ? 'Configurator' : 'Configurateur', href: configuratorPath(locale), blob: 'konfigurator configurator configurateur gestalten design' },
    { title: locale === 'de' ? 'Produkte' : locale === 'en' ? 'Products' : 'Produits', href: sectionPath('products', locale), blob: 'produkte products produits' },
    { title: locale === 'de' ? 'Düfte' : locale === 'en' ? 'Scents' : 'Parfums', href: sectionPath('scents', locale), blob: 'duefte scents parfums' },
    { title: locale === 'de' ? 'Branchen' : locale === 'en' ? 'Industries' : 'Secteurs', href: sectionPath('industries', locale), blob: 'branchen industries secteurs' },
  ];
  for (const p of pages) out.push({ kind: 'pages', title: p.title, href: p.href, blob: norm(p.blob) });

  return out;
}

export function runSearch(index: SearchEntry[], query: string, limit = 24): SearchEntry[] {
  const q = norm(query.trim());
  if (!q) return [];
  const terms = q.split(/\s+/).filter(Boolean);
  return index
    .map(e => {
      let score = 0;
      for (const t of terms) {
        if (!e.blob.includes(t)) return { e, score: -1 };
        if (norm(e.title).includes(t)) score += 3; else score += 1;
      }
      return { e, score };
    })
    .filter(r => r.score >= 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(r => r.e);
}
