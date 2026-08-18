import type { Locale } from '@/i18n/config';
import { locales } from '@/i18n/config';

// Global, admin-managed site settings. Localized fields are keyed by locale.
// Kept intentionally small and controlled (no arbitrary page-builder).
export type L10n = Record<Locale, string>;

export type SiteSettings = {
  // `configured` distinguishes "admin has never opened/saved Ayarlar" (fall back to the
  // shipped seed announcement so nothing regresses) from "admin explicitly saved this
  // section" (the `enabled` boolean becomes authoritative, including explicit OFF).
  // See repositories/settings.ts saveSettings() and app/[locale]/layout.tsx.
  announcement: { enabled: boolean; configured: boolean; text: L10n; linkLabel: L10n; href: string };
  contact: { email: string; whatsapp: string; phone: string; instagram: string; facebook: string; linkedin: string };
  brandName: string;
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
  // Completion pass §13: homepage SEO admin. Empty per-locale strings fall back to the
  // shipped hardcoded title/description (app/[locale]/page.tsx generateMetadata) so an
  // unconfigured install never regresses. Canonical/hreflang are always derived
  // automatically from the current path (lib/seo.ts buildMetadata) — never admin-editable,
  // since a wrong manual canonical would be an SEO footgun. Product-page SEO
  // (lib/seo.ts + per-product `seo.title`/`seo.description`) is untouched by this.
  seo: { home: { title: L10n; description: L10n } };
};

const emptyL10n = (): L10n => Object.fromEntries(locales.map(l => [l, ''])) as L10n;

export function defaultSettings(): SiteSettings {
  return {
    announcement: { enabled: false, configured: false, text: emptyL10n(), linkLabel: emptyL10n(), href: '' },
    contact: { email: '', whatsapp: '', phone: '', instagram: '', facebook: '', linkedin: '' },
    brandName: 'BUGO DUFT',
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
    seo: { home: { title: emptyL10n(), description: emptyL10n() } },
  };
}

// Merge a partial stored doc over defaults so missing keys never break the UI.
export function mergeSettings(over: Partial<SiteSettings> | null | undefined): SiteSettings {
  const d = defaultSettings();
  if (!over) return d;
  return {
    announcement: { ...d.announcement, ...(over.announcement ?? {}),
      text: { ...d.announcement.text, ...(over.announcement?.text ?? {}) },
      linkLabel: { ...d.announcement.linkLabel, ...(over.announcement?.linkLabel ?? {}) } },
    contact: { ...d.contact, ...(over.contact ?? {}) },
    brandName: over.brandName ?? d.brandName,
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
      brandCopy: { ...d.footer.brandCopy, ...(over.footer?.brandCopy ?? {}) },
      minOrderCopy: { ...d.footer.minOrderCopy, ...(over.footer?.minOrderCopy ?? {}) },
      bottomStatement: { ...d.footer.bottomStatement, ...(over.footer?.bottomStatement ?? {}) } },
    seo: { home: { title: { ...d.seo.home.title, ...(over.seo?.home?.title ?? {}) },
      description: { ...d.seo.home.description, ...(over.seo?.home?.description ?? {}) } } },
  };
}
