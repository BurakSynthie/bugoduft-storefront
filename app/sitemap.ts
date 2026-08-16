import type { MetadataRoute } from 'next';
import { locales } from '@/i18n/config';
import { abs } from '@/config/site';
import { listProducts, listIndustries, productAlternates, industryAlternates, sectionAlternates, homeAlternates } from '@/repositories/catalog';
import { sectionPath } from '@/lib/routing';

function withAlt(paths: Record<string,string>) {
  return { languages: Object.fromEntries(Object.entries(paths).map(([l,p]) => [l, abs(p)])) };
}
export default function sitemap(): MetadataRoute.Sitemap {
  const out: MetadataRoute.Sitemap = [];
  // homepage per locale
  const home = homeAlternates();
  for (const l of locales) out.push({ url: abs(home[l]), changeFrequency:'weekly', priority:1, alternates: withAlt(home) });
  // products index + scents index + industries index
  for (const sec of ['products','scents','industries'] as const) {
    const alt = sectionAlternates(sec);
    for (const l of locales) out.push({ url: abs(sectionPath(sec, l)), changeFrequency:'weekly', priority:0.7, alternates: withAlt(alt) });
  }
  // product detail (enumerate via DE list; alternates carry all locales)
  for (const p of listProducts('de')) {
    const alt = productAlternates(p.groupId);
    for (const l of locales) out.push({ url: abs(alt[l]), changeFrequency:'weekly', priority:0.8, alternates: withAlt(alt) });
  }
  // industry detail
  for (const i of listIndustries('de')) {
    const alt = industryAlternates(i.groupId);
    for (const l of locales) out.push({ url: abs(alt[l]), changeFrequency:'monthly', priority:0.6, alternates: withAlt(alt) });
  }
  return out;
}
