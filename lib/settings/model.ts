import type { Locale } from '@/i18n/config';
import { locales } from '@/i18n/config';

// Global, admin-managed site settings. Localized fields are keyed by locale.
// Kept intentionally small and controlled (no arbitrary page-builder).
export type L10n = Record<Locale, string>;

// Launch admin: the storefront navigation labels the owner may edit (DE/EN/FR).
// Route architecture is fixed in code (lib/routing) — only the visible LABEL is editable,
// so an admin can never destroy a route by renaming it.
export type NavLabels = {
  products: L10n; scents: L10n; industries: L10n; sample: L10n; production: L10n; faq: L10n;
};

// Launch admin: the SEO fields exposed per indexable page. Canonical/hreflang/x-default,
// JSON-LD, sitemap and robots stay automatic (never here). Empty strings fall back to the
// shipped seed metadata so an unconfigured install never regresses.
export type PageSeo = { title: L10n; description: L10n; h1: L10n; intro: L10n; ogImage: string | null };
export type SeoPageKey =
  | 'home' | 'products' | 'scents' | 'industries' | 'sample' | 'production'
  | 'autohaus' | 'werkstatt' | 'about' | 'b2b' | 'blog';

// Launch admin: editable content for the two launch-important industry pages. Routes/slugs
// stay stable (data-driven from the seed); only the visible copy + page SEO are editable.
export type IndustryContent = { h1: L10n; body: L10n; seoTitle: L10n; seoDescription: L10n };

export type CustomIndustry = {
  id: string;
  active: boolean;
  name: L10n;
  slug: L10n;
  h1: L10n;
  body: L10n;
  seoTitle: L10n;
  seoDescription: L10n;
  ogImage: string | null;
};

export type BrandMedia = {
  logo: string | null;            // main header/footer logo (optional; text brand is fallback)
  favicon: string | null;         // admin-selected favicon (falls back to /favicon.svg)
  appleTouchIcon: string | null;  // apple-touch-icon
};

// Launch admin: launch-critical factual values, centralized so they are not duplicated as
// hardcoded strings across the storefront. Checkout pricing is NOT driven by these — they
// feed informational/marketing copy only (see §F of the task).
export type BusinessFacts = {
  minOrderQty: number; qtyStep: number;
  productionMinDays: number; productionMaxDays: number;
  deliveryMinDays: number; deliveryMaxDays: number;
  originLabel: L10n;              // localized "produced in Germany" style label
  deliveryRegion: L10n;          // localized "Europe-wide" label
  shippingIncluded: boolean;
  customsIncluded: boolean;
  yearsExperience: string;       // "12+"
  monthlyCapacity: string;       // "4 Mio."
  freeSampleThreshold: number;   // 5000
  paidSamplePriceEur: number;    // 40
  paidSampleCreditEur: number;   // 20
};

export type SiteSettings = {
  // `configured` distinguishes "admin has never opened/saved Ayarlar" (fall back to the
  // shipped seed announcement so nothing regresses) from "admin explicitly saved this
  // section" (the `enabled` boolean becomes authoritative, including explicit OFF).
  // See repositories/settings.ts saveSettings() and app/[locale]/layout.tsx.
  // §D localized announcement: each locale carries its OWN href so EN/FR visitors are never
  // routed to a DE-only URL. `href` (legacy single value) is kept as a fallback only.
  announcement: { enabled: boolean; configured: boolean; text: L10n; linkLabel: L10n; href: string; hrefL10n: L10n };
  // §E role-specific contact fields. `graphic` (Grafik & Design) and `service`
  // (Kundenservice) are wired separately on the storefront. `email/whatsapp/phone` remain
  // as the general/legacy contact used by footer social + quick-contact widget.
  contact: {
    email: string; whatsapp: string; phone: string; instagram: string; facebook: string; linkedin: string;
    graphic: { email: string; whatsapp: string; phone: string };
    service: { email: string; whatsapp: string; phone: string };
  };
  brandName: string;
  brand: BrandMedia;
  navLabels: NavLabels;
  businessFacts: BusinessFacts;
  defaultOgImage: string | null;
  sections: { gallery: boolean; references: boolean; faq: boolean };
  quickContact: { enabled: boolean };   // §4-6 floating quick-contact widget (reuses `contact`)
  integrations: {                       // §29-34 PUBLIC ids only — never secrets
    ga4Id: string; gtmId: string; metaPixelId: string; searchConsole: string;
    ga4Enabled: boolean; gtmEnabled: boolean; metaEnabled: boolean;
    analyticsMode: 'direct' | 'gtm';    // §5 avoid GA4+GTM duplicate pageviews
  };
  legal: {                              // §3 Impressum/Datenschutz company data (no placeholders)
    companyName: string; representative: string; address: string; vatId: string; email: string;
  };
  originClaim: { de: string; en: string; fr: string };  // §10 single source for the Germany claim
  sample: { enabled: boolean; threshold: number; valueEur: number };
  // Final hardening §P1: admin-managed commercial values (no source edit / redeploy for
  // normal changes). Money stored internally in integer cents; percent as an integer
  // 0..100. `paidSample` = the standalone €40 Duftmuster-Set + its resulting €20 credit
  // (distinct from `sample` above, which is the FREE 5k-unit set). `firstOrder` = the 5%
  // first-order member benefit. Non-stacking is enforced server-side (larger valid benefit
  // wins) regardless of these values.
  commerce: {
    paidSample: { enabled: boolean; priceCents: number; creditCents: number };
    firstOrder: { enabled: boolean; percent: number };
  };
  footer: { brandCopy: L10n; minOrderCopy: L10n; bottomStatement: L10n };
  // §H SEO management center. `home` retained for back-compat; `pages` covers the wider set
  // of indexable pages. Empty per-locale strings fall back to shipped defaults so an
  // unconfigured install never regresses. Canonical/hreflang are always derived
  // automatically (lib/seo.ts buildMetadata) — never admin-editable.
  seo: {
    home: { title: L10n; description: L10n };
    pages: Record<SeoPageKey, PageSeo>;
  };
  // §K editable industry page content (Autohaus + Werkstatt). Routes stay stable.
  industryContent: { autohaus: IndustryContent; werkstatt: IndustryContent };
  customIndustries: CustomIndustry[];
};

const emptyL10n = (): L10n => Object.fromEntries(locales.map(l => [l, ''])) as L10n;
const l10n = (de: string, en: string, fr: string): L10n => ({ de, en, fr } as L10n);

function defaultNavLabels(): NavLabels {
  return {
    products:   l10n('Duftbäume', 'Air Fresheners', 'Désodorisants'),
    scents:     l10n('Düfte', 'Scents', 'Parfums'),
    industries: l10n('Für Unternehmen', 'For Businesses', 'Pour les entreprises'),
    sample:     l10n('Duftmuster', 'Scent Samples', 'Échantillons'),
    production: l10n('Produktion', 'Production', 'Production'),
    faq:        l10n('FAQ', 'FAQ', 'FAQ'),
  };
}

function emptyPageSeo(): PageSeo {
  return { title: emptyL10n(), description: emptyL10n(), h1: emptyL10n(), intro: emptyL10n(), ogImage: null };
}
export const SEO_PAGE_KEYS: SeoPageKey[] =
  ['home', 'products', 'scents', 'industries', 'sample', 'production', 'autohaus', 'werkstatt', 'about', 'b2b', 'blog'];
function defaultSeoPages(): Record<SeoPageKey, PageSeo> {
  return Object.fromEntries(SEO_PAGE_KEYS.map(k => [k, emptyPageSeo()])) as Record<SeoPageKey, PageSeo>;
}

function defaultBusinessFacts(): BusinessFacts {
  return {
    minOrderQty: 1000, qtyStep: 1000,
    productionMinDays: 10, productionMaxDays: 12,
    deliveryMinDays: 15, deliveryMaxDays: 17,
    originLabel: l10n('Produziert in Deutschland', 'Produced in Germany', 'Produits en Allemagne'),
    deliveryRegion: l10n('Europaweit', 'Europe-wide', "À l'échelle européenne"),
    shippingIncluded: true, customsIncluded: true,
    yearsExperience: '12+', monthlyCapacity: '4 Mio.',
    freeSampleThreshold: 5000, paidSamplePriceEur: 40, paidSampleCreditEur: 20,
  };
}

function emptyIndustryContent(): IndustryContent {
  return { h1: emptyL10n(), body: emptyL10n(), seoTitle: emptyL10n(), seoDescription: emptyL10n() };
}

function mergeCustomIndustry(o: Partial<CustomIndustry> | undefined): CustomIndustry {
  return {
    id: typeof o?.id === 'string' ? o.id : '',
    active: o?.active !== false,
    name: mergeL10n(emptyL10n(), o?.name),
    slug: mergeL10n(emptyL10n(), o?.slug),
    h1: mergeL10n(emptyL10n(), o?.h1),
    body: mergeL10n(emptyL10n(), o?.body),
    seoTitle: mergeL10n(emptyL10n(), o?.seoTitle),
    seoDescription: mergeL10n(emptyL10n(), o?.seoDescription),
    ogImage: o?.ogImage ?? null,
  };
}

export function defaultSettings(): SiteSettings {
  return {
    announcement: { enabled: false, configured: false, text: emptyL10n(), linkLabel: emptyL10n(), href: '', hrefL10n: emptyL10n() },
    contact: {
      email: '', whatsapp: '', phone: '', instagram: '', facebook: '', linkedin: '',
      graphic: { email: 'grafik@bugoduft.de', whatsapp: '+90 507 296 61 75', phone: '' },
      service: { email: 'kundenservice@bugoduft.de', whatsapp: '+90 531 723 48 01', phone: '' },
    },
    brandName: 'BUGO DUFT',
    brand: { logo: null, favicon: null, appleTouchIcon: null },
    navLabels: defaultNavLabels(),
    businessFacts: defaultBusinessFacts(),
    defaultOgImage: null,
    sections: { gallery: true, references: true, faq: true },
    quickContact: { enabled: true },
    integrations: { ga4Id:'', gtmId:'', metaPixelId:'', searchConsole:'', ga4Enabled:false, gtmEnabled:false, metaEnabled:false, analyticsMode:'direct' },
    legal: { companyName:'', representative:'', address:'', vatId:'', email:'' },
    originClaim: { de:'Made for your brand · Germany', en:'Made for your brand · Germany', fr:'Made for your brand · Germany' },
    sample: { enabled: true, threshold: 5000, valueEur: 40 },
    commerce: {
      paidSample: { enabled: true, priceCents: 4000, creditCents: 2000 },  // €40 set → €20 credit
      firstOrder: { enabled: true, percent: 5 },
    },
    footer: { brandCopy: emptyL10n(), minOrderCopy: emptyL10n(), bottomStatement: emptyL10n() },
    seo: { home: { title: emptyL10n(), description: emptyL10n() }, pages: defaultSeoPages() },
    industryContent: { autohaus: emptyIndustryContent(), werkstatt: emptyIndustryContent() },
    customIndustries: [],
  };
}

const mergeL10n = (d: L10n, o: Partial<L10n> | undefined): L10n => ({ ...d, ...(o ?? {}) });

function mergePageSeo(d: PageSeo, o: Partial<PageSeo> | undefined): PageSeo {
  return {
    title: mergeL10n(d.title, o?.title), description: mergeL10n(d.description, o?.description),
    h1: mergeL10n(d.h1, o?.h1), intro: mergeL10n(d.intro, o?.intro),
    ogImage: o?.ogImage ?? d.ogImage,
  };
}

function mergeIndustry(d: IndustryContent, o: Partial<IndustryContent> | undefined): IndustryContent {
  return {
    h1: mergeL10n(d.h1, o?.h1), body: mergeL10n(d.body, o?.body),
    seoTitle: mergeL10n(d.seoTitle, o?.seoTitle), seoDescription: mergeL10n(d.seoDescription, o?.seoDescription),
  };
}

// Merge a partial stored doc over defaults so missing keys never break the UI.
export function mergeSettings(over: Partial<SiteSettings> | null | undefined): SiteSettings {
  const d = defaultSettings();
  if (!over) return d;
  const overPages = (over.seo?.pages ?? {}) as Partial<Record<SeoPageKey, Partial<PageSeo>>>;
  return {
    announcement: { ...d.announcement, ...(over.announcement ?? {}),
      text: mergeL10n(d.announcement.text, over.announcement?.text),
      linkLabel: mergeL10n(d.announcement.linkLabel, over.announcement?.linkLabel),
      hrefL10n: mergeL10n(d.announcement.hrefL10n, over.announcement?.hrefL10n) },
    contact: { ...d.contact, ...(over.contact ?? {}),
      graphic: { ...d.contact.graphic, ...(over.contact?.graphic ?? {}) },
      service: { ...d.contact.service, ...(over.contact?.service ?? {}) } },
    brandName: over.brandName ?? d.brandName,
    brand: { ...d.brand, ...(over.brand ?? {}) },
    navLabels: {
      products:   mergeL10n(d.navLabels.products,   over.navLabels?.products),
      scents:     mergeL10n(d.navLabels.scents,     over.navLabels?.scents),
      industries: mergeL10n(d.navLabels.industries, over.navLabels?.industries),
      sample:     mergeL10n(d.navLabels.sample,     over.navLabels?.sample),
      production: mergeL10n(d.navLabels.production, over.navLabels?.production),
      faq:        mergeL10n(d.navLabels.faq,        over.navLabels?.faq),
    },
    businessFacts: { ...d.businessFacts, ...(over.businessFacts ?? {}),
      originLabel: mergeL10n(d.businessFacts.originLabel, over.businessFacts?.originLabel),
      deliveryRegion: mergeL10n(d.businessFacts.deliveryRegion, over.businessFacts?.deliveryRegion) },
    defaultOgImage: over.defaultOgImage ?? d.defaultOgImage,
    sections: { ...d.sections, ...(over.sections ?? {}) },
    quickContact: { ...d.quickContact, ...(over.quickContact ?? {}) },
    integrations: { ...d.integrations, ...(over.integrations ?? {}) },
    legal: { ...d.legal, ...(over.legal ?? {}) },
    originClaim: { ...d.originClaim, ...(over.originClaim ?? {}) },
    sample: { ...d.sample, ...(over.sample ?? {}) },
    commerce: {
      paidSample: { ...d.commerce.paidSample, ...(over.commerce?.paidSample ?? {}) },
      firstOrder: { ...d.commerce.firstOrder, ...(over.commerce?.firstOrder ?? {}) },
    },
    footer: { ...d.footer, ...(over.footer ?? {}),
      brandCopy: mergeL10n(d.footer.brandCopy, over.footer?.brandCopy),
      minOrderCopy: mergeL10n(d.footer.minOrderCopy, over.footer?.minOrderCopy),
      bottomStatement: mergeL10n(d.footer.bottomStatement, over.footer?.bottomStatement) },
    seo: {
      home: { title: mergeL10n(d.seo.home.title, over.seo?.home?.title),
        description: mergeL10n(d.seo.home.description, over.seo?.home?.description) },
      pages: Object.fromEntries(SEO_PAGE_KEYS.map(k =>
        [k, mergePageSeo(d.seo.pages[k], overPages[k])])) as Record<SeoPageKey, PageSeo>,
    },
    industryContent: {
      autohaus: mergeIndustry(d.industryContent.autohaus, over.industryContent?.autohaus),
      werkstatt: mergeIndustry(d.industryContent.werkstatt, over.industryContent?.werkstatt),
    },
    customIndustries: Array.isArray(over.customIndustries)
      ? over.customIndustries.map(i => mergeCustomIndustry(i)).filter(i => i.id)
      : [],
  };
}

// §I brand suffix normalization. Legacy stored SEO titles may already contain a
// " | BUGO DUFT" (or current brand) suffix; combined with the metadata title template
// that would render "… | BUGO DUFT | BUGO DUFT". Strip any trailing brand-suffix so the
// central template can add the brand exactly once. Whitespace/separator tolerant; only a
// TRAILING brand token is removed so a valid title that merely mentions the brand mid-string
// is preserved.
export function stripBrandSuffix(title: string, brand: string): string {
  if (!title) return title;
  let out = title.trim();
  const brands = Array.from(new Set([brand, 'BUGO DUFT'].filter(Boolean)));
  let changed = true;
  while (changed) {
    changed = false;
    for (const b of brands) {
      const re = new RegExp('\\s*[|\\u00b7\\-\\u2013\\u2014:]\\s*' + escapeRegExp(b) + '\\s*$', 'i');
      if (re.test(out)) { out = out.replace(re, '').trim(); changed = true; }
    }
  }
  return out;
}
function escapeRegExp(s: string): string { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
