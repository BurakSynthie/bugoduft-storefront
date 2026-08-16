import type { Locale } from '@/i18n/config';
import { locales } from '@/i18n/config';
// Localized URL segments. Slugs themselves are per-locale (from the data layer).
export const seg = {
  products:   { de:'produkte',  en:'products',   fr:'produits' },
  scents:     { de:'duefte',    en:'scents',     fr:'parfums'  },
  industries: { de:'branchen',  en:'industries', fr:'secteurs' },
  configurator:{ de:'konfigurator', en:'configurator', fr:'configurateur' },
} satisfies Record<string, Record<Locale, string>>;
export type Section = keyof typeof seg;

export function sectionPath(section: Section, locale: Locale) { return `/${locale}/${seg[section][locale]}`; }
export function itemPath(section: Section, locale: Locale, slug: string) { return `/${locale}/${seg[section][locale]}/${slug}`; }

// Which section does a first path-segment belong to, for a given locale?
export function matchSection(locale: Locale, first: string): Section | null {
  for (const s of Object.keys(seg) as Section[]) if (seg[s][locale] === first) return s;
  return null;
}
export const allLocales = locales;

export function configuratorPath(locale: Locale, collectionCode?: string) {
  const base = `/${locale}/${seg.configurator[locale]}`;
  return collectionCode ? `${base}?k=${collectionCode}` : base;
}
