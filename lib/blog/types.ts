import type { Locale } from '@/i18n/config';
import { locales } from '@/i18n/config';
import type { BlogBlock } from './content';

export type BlogStatus = 'draft' | 'published';

// Public-facing article view (a single locale).
export type BlogArticleView = {
  id: string;
  status: BlogStatus;
  locale: Locale;
  slug: string;
  title: string;
  h1: string;
  excerpt: string;
  category: string;
  content: BlogBlock[];
  coverImage: string | null;
  coverAlt: string;
  seoTitle: string;
  metaDescription: string;
  ogImage: string | null;
  publishedAt: string | null;
  updatedAt: string;
  // localized slugs of the SAME post that ACTUALLY exist (for hreflang/alternates)
  slugs: Partial<Record<Locale, string>>;
};

// Card shape for index/preview lists.
export type BlogCard = {
  id: string;
  slug: string;
  title: string;
  excerpt: string;
  category: string;
  coverImage: string | null;
  coverAlt: string;
  publishedAt: string | null;
};

// Blog article URL for a locale + slug. `blog` is a stable segment across locales,
// consistent with the existing /[locale]/info/[slug] convention.
export function blogIndexPath(locale: Locale): string { return `/${locale}/blog`; }
export function blogArticlePath(locale: Locale, slug: string): string { return `/${locale}/blog/${slug}`; }

// Reciprocal hreflang alternates from the set of localized slugs that exist.
export function blogAlternates(slugs: Partial<Record<Locale, string>>): Partial<Record<Locale, string>> {
  const out: Partial<Record<Locale, string>> = {};
  for (const l of locales) { const s = slugs[l]; if (s) out[l] = blogArticlePath(l, s); }
  return out;
}

// Blog index exists in all locales → slug-stable reciprocal alternates.
export function blogIndexAlternates(): Record<Locale, string> {
  return Object.fromEntries(locales.map(l => [l, blogIndexPath(l)])) as Record<Locale, string>;
}

// URL-safe slug normalization (shared by admin validation + suggestion).
export function normalizeSlug(input: string): string {
  return (input || '')
    .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue')
    .replace(/Ä/g, 'ae').replace(/Ö/g, 'oe').replace(/Ü/g, 'ue')
    .replace(/ß/g, 'ss')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')            // strip remaining diacritics
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')                // non-alnum → hyphen
    .replace(/^-+|-+$/g, '')                    // trim hyphens
    .replace(/-{2,}/g, '-')                     // collapse
    .slice(0, 96);
}

export function isValidSlug(slug: string): boolean {
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) && slug.length >= 1 && slug.length <= 96;
}
