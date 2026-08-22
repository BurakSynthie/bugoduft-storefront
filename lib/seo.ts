import type { Metadata } from 'next';
import type { Locale } from '@/i18n/config';
import { htmlLang } from '@/i18n/config';
import { abs, site } from '@/config/site';
import { stripBrandSuffix } from '@/lib/settings/model';

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
  brand?: string;                                // §I current brand; strips a legacy trailing suffix
  siteName?: string;                             // §B OpenGraph siteName from brand setting
};

export function buildMetadata(a: BuildArgs): Metadata {
  const languages: Record<string, string> = {};
  for (const [loc, p] of Object.entries(a.alternates)) if (p) languages[htmlLang[loc as Locale]] = abs(p);
  if (a.alternates.de) languages['x-default'] = abs(a.alternates.de);   // x-default -> German source

  const brand = a.brand || site.name;
  // §I Normalize any legacy "… | BUGO DUFT" suffix out of the page title so the central
  // metadata template (layout.tsx) adds the brand exactly once — never "… | BUGO DUFT | BUGO DUFT".
  const title = stripBrandSuffix(a.title, brand);
  const siteName = a.siteName || brand;

  return {
    title,
    description: a.description,
    metadataBase: new URL(site.url),
    alternates: { canonical: abs(a.path), languages },   // canonical self-references THIS locale
    robots: { index: a.index ?? true, follow: a.follow ?? true },
    openGraph: {
      title: a.ogTitle ?? title, description: a.ogDescription ?? a.description,
      url: abs(a.path), siteName, type: a.ogType ?? 'website',
      locale: ogLocale[a.locale],
      images: [{ url: abs(a.ogImage ?? site.defaultOgImage) }],
    },
  };
}

/* ---------- JSON-LD builders (must match visible content; no fake reviews/stock) ---------- */
// §O brand-aware schema: Organization/Product use the centralized current brand when provided,
// falling back to the shipped site name so an unconfigured install is unaffected.
// §5 Organization contact email is CUSTOMER-FACING: prefer the admin Kundenservice email, then
// the general contact email. The internal notification address (site.adminEmail) is NEVER
// emitted into storefront schema. `logo` is included only when a real brand logo asset exists.
export function organizationLd(opts?: { brand?: string; email?: string | null; logo?: string | null }) {
  const email = (opts?.email || '').trim();
  const ld: Record<string, unknown> = {
    '@context':'https://schema.org', '@type':'Organization',
    name: opts?.brand || site.name, url: site.url,
  };
  if (opts?.logo) ld.logo = opts.logo.startsWith('http') ? opts.logo : `${site.url}${opts.logo}`;
  if (email) ld.contactPoint = [{ '@type':'ContactPoint', email, contactType:'customer service' }];
  return ld;
}
// §v1.2.6 A2 — WebSite entity for the homepage so search engines can identify the site name.
// Exactly ONE WebSite entity is emitted (homepage only). Does not replace Organization schema;
// both are emitted together on the homepage. name defaults to the current brand → 'BUGO DUFT';
// url is the canonical site URL (https://bugoduft.de) from the central site config.
export function websiteLd(opts?: { brand?: string }) {
  return {
    '@context': 'https://schema.org', '@type': 'WebSite',
    name: opts?.brand || site.name, url: site.url,
  };
}
export function productLd(p: { name:string; description:string; url:string; priceFromCents:number; currency:string; brand?:string; }) {
  return { '@context':'https://schema.org', '@type':'Product', name:p.name, description:p.description,
    brand:{ '@type':'Brand', name: p.brand || site.name },
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
