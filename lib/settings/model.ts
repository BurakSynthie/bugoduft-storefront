import type { Locale } from '@/i18n/config';
import { locales } from '@/i18n/config';

// Global, admin-managed site settings. Localized fields are keyed by locale.
// Kept intentionally small and controlled (no arbitrary page-builder).
export type L10n = Record<Locale, string>;

export type SiteSettings = {
  announcement: { enabled: boolean; text: L10n; linkLabel: L10n; href: string };
  contact: { email: string; whatsapp: string; phone: string; instagram: string; facebook: string; linkedin: string };
  brandName: string;
  defaultOgImage: string | null;
  sections: { gallery: boolean; references: boolean; faq: boolean };
  sample: { enabled: boolean; threshold: number; valueEur: number };
};

const emptyL10n = (): L10n => Object.fromEntries(locales.map(l => [l, ''])) as L10n;

export function defaultSettings(): SiteSettings {
  return {
    announcement: { enabled: false, text: emptyL10n(), linkLabel: emptyL10n(), href: '' },
    contact: { email: '', whatsapp: '', phone: '', instagram: '', facebook: '', linkedin: '' },
    brandName: 'BUGO DUFT',
    defaultOgImage: null,
    sections: { gallery: true, references: true, faq: true },
    sample: { enabled: true, threshold: 5000, valueEur: 40 },
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
    sample: { ...d.sample, ...(over.sample ?? {}) },
  };
}
