import type { Metadata } from 'next';
import type { Locale } from '@/i18n/config';
import { htmlLang } from '@/i18n/config';
import { abs, site } from '@/config/site';

const ogLocale: Record<Locale, string> = { de:'de_DE', en:'en_GB', fr:'fr_FR' };

type BuildArgs = {
  locale: Locale;
  path: string;                                  // localized path of THIS page (canonical self-ref)
  title: string;
  description: string;
  alternates: Partial<Record<Locale, string>>;   // equivalent localized paths -> reciprocal hreflang
  index?: boolean; follow?: boolean;
  ogTitle?: string; ogDescription?: string; ogImage?: string;
  ogType?: 'website' | 'article';
};

export function buildMetadata(a: BuildArgs): Metadata {
  const languages: Record<string, string> = {};
  for (const [loc, p] of Object.entries(a.alternates)) if (p) languages[htmlLang[loc as Locale]] = abs(p);
  if (a.alternates.de) languages['x-default'] = abs(a.alternates.de);   // x-default -> German source

  return {
    title: a.title,
    description: a.description,
    metadataBase: new URL(site.url),
    alternates: { canonical: abs(a.path), languages },   // canonical self-references THIS locale
    robots: { index: a.index ?? true, follow: a.follow ?? true },
    openGraph: {
      title: a.ogTitle ?? a.title, description: a.ogDescription ?? a.description,
      url: abs(a.path), siteName: site.name, type: a.ogType ?? 'website',
      locale: ogLocale[a.locale],
      images: [{ url: abs(a.ogImage ?? site.defaultOgImage) }],
    },
  };
}

/* ---------- JSON-LD builders (must match visible content; no fake reviews/stock) ---------- */
export function organizationLd() {
  return { '@context':'https://schema.org', '@type':'Organization',
    name: site.name, url: site.url,
    contactPoint: [{ '@type':'ContactPoint', email: site.adminEmail, contactType:'sales' }] };
}
export function productLd(p: { name:string; description:string; url:string; priceFromCents:number; currency:string; }) {
  return { '@context':'https://schema.org', '@type':'Product', name:p.name, description:p.description,
    brand:{ '@type':'Brand', name: site.name },
    offers:{ '@type':'AggregateOffer', priceCurrency:p.currency,
      lowPrice:(p.priceFromCents/100).toFixed(2), availability:'https://schema.org/InStock', url:p.url } };
}
export function breadcrumbLd(items: { name:string; url:string }[]) {
  return { '@context':'https://schema.org', '@type':'BreadcrumbList',
    itemListElement: items.map((it,i)=>({ '@type':'ListItem', position:i+1, name:it.name, item:it.url })) };
}
export function faqLd(items: { q:string; a:string }[]) {
  return { '@context':'https://schema.org', '@type':'FAQPage',
    mainEntity: items.map(x=>({ '@type':'Question', name:x.q,
      acceptedAnswer:{ '@type':'Answer', text:x.a } })) };
}
