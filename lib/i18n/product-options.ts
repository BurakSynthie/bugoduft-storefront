import type { Locale } from '@/i18n/config';

// §L Product option label localization. Product options are stored with a German label
// (`labelDe`) only — the storefront must not show German text on EN/FR pages. Known option
// keys are mapped to localized labels here; any unknown/custom key falls back to the stored
// German label (never blank). This fixes concrete localization wiring without redesigning
// product management or adding option-translation schema.
const OPTION_LABELS: Record<string, Record<Locale, string>> = {
  intense_fragrance: { de: 'Intensivduft', en: 'Intensive fragrance', fr: 'Parfum intense' },
};

export function optionLabel(key: string, labelDe: string, locale: Locale): string {
  const m = OPTION_LABELS[key];
  return (m && m[locale]) || labelDe;
}
