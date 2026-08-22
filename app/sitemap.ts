import type { MetadataRoute } from 'next';
import { locales, type Locale } from '@/i18n/config';
import { abs } from '@/config/site';
import { listIndustries, industryAlternates, sectionAlternates, homeAlternates } from '@/repositories/catalog';
import { getProducts as getProductsRead, getProductAlternates } from '@/repositories/catalog.read';
import { getSettings } from '@/repositories/settings';
import { listPublishedForSitemap } from '@/repositories/blog';
import { blogIndexPath, blogArticlePath, blogIndexAlternates } from '@/lib/blog/types';
import { sectionPath } from '@/lib/routing';

function withAlt(paths: Record<string, string>) {
  return { languages: Object.fromEntries(Object.entries(paths).map(([l, p]) => [l, abs(p)])) };
}

// §9 DB-first sitemap: product slugs come from the live catalog (seed fallback only when
// Supabase is unconfigured). Excludes admin, account, API and the noindex configurator.
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const out: MetadataRoute.Sitemap = [];

  const home = homeAlternates();
  for (const l of locales) out.push({ url: abs(home[l]), changeFrequency:'weekly', priority:1, alternates: withAlt(home) });

  for (const sec of ['products','scents','industries'] as const) {
    const alt = sectionAlternates(sec);
    for (const l of locales) out.push({ url: abs(sectionPath(sec, l)), changeFrequency:'weekly', priority:0.7, alternates: withAlt(alt) });
  }

  // Paid sample index — only when enabled.
  try {
    const settings = await getSettings();
    if (settings.commerce.paidSample.enabled) {
      const alt = sectionAlternates('sample');
      for (const l of locales) out.push({ url: abs(sectionPath('sample', l)), changeFrequency:'monthly', priority:0.5, alternates: withAlt(alt) });
    }
  } catch {}

  // Product details — enumerate current DB products (by group), DB-first localized slugs.
  try {
    const groups = new Set((await getProductsRead('de')).map((p: any) => p.groupId).filter(Boolean));
    for (const gid of groups) {
      const alt = await getProductAlternates(gid as string);
      for (const l of locales) if (alt[l]) out.push({ url: abs(alt[l]), changeFrequency:'weekly', priority:0.8, alternates: withAlt(alt) });
    }
  } catch {}

  // Industry details (content pages).
  for (const i of listIndustries('de')) {
    const alt = industryAlternates(i.groupId);
    for (const l of locales) out.push({ url: abs(alt[l]), changeFrequency:'monthly', priority:0.6, alternates: withAlt(alt) });
  }

  // §12 Blog index (DE/EN/FR).
  {
    const alt = blogIndexAlternates();
    for (const l of locales) out.push({ url: abs(blogIndexPath(l)), changeFrequency:'weekly', priority:0.6, alternates: withAlt(alt) });
  }

  // §12 Published articles only (drafts are excluded by the repository status filter). Each
  // translation is emitted with reciprocal hreflang alternates for the locales that exist.
  try {
    for (const post of await listPublishedForSitemap()) {
      const alt: Record<string, string> = {};
      for (const l of locales) { const s = post.slugs[l]; if (s) alt[l] = blogArticlePath(l, s); }
      const lastModified = post.lastModified ? new Date(post.lastModified) : undefined;
      for (const l of locales) {
        const s = post.slugs[l];
        if (s) out.push({ url: abs(blogArticlePath(l, s)), lastModified, changeFrequency:'monthly', priority:0.5, alternates: withAlt(alt) });
      }
    }
  } catch {}

  return out;
}
