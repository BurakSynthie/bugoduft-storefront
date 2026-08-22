import type { Locale } from '@/i18n/config';
export type QtyRules = { min: number; max: number; step: number };
export type QtyError = 'below_min' | 'above_max' | 'bad_step' | null;

// Server-authoritative validation (also mirrored client-side for UX).
// §HIGH-11 STEP ALIGNMENT IS RELATIVE TO THE PRODUCT MINIMUM, not to zero. A product with
// min=5.000 / step=2.000 must accept 5.000 (the minimum itself), 7.000, 9.000 … and reject
// 6.000. The rule is therefore (qty - min) % step === 0, NOT qty % step === 0. This is the ONE
// rule enforced everywhere: admin envelope, DB CHECK, configurator, server validation and the
// quick-quantity buttons (validateQtyRules additionally guarantees (max - min) % step === 0 so
// the maximum is always itself a selectable quantity).
export function validateQuantity(qty: number, r: QtyRules): QtyError {
  if (!Number.isFinite(qty) || qty < r.min) return 'below_min';
  if (qty > r.max) return 'above_max';
  if (r.step <= 0 || (qty - r.min) % r.step !== 0) return 'bad_step';
  return null;
}

// Locale-aware integer grouping ("5.000" de / "5,000" en / "5 000" fr).
function fmt(n: number, locale: Locale): string {
  try { return new Intl.NumberFormat(locale === 'de' ? 'de-DE' : locale === 'fr' ? 'fr-FR' : 'en-US').format(n); }
  catch { return String(n); }
}

// §HIGH-11 — messages now reflect the ACTUAL product rules (min/max/step), never a hardcoded
// "1.000 minimum / 100.000 maximum / 1.000 step". Rules default to the canonical envelope so
// legacy callers keep working, but the configurator passes the selected product's real rules.
const DEFAULT_RULES: QtyRules = { min: 1000, max: 100000, step: 1000 };
export function quantityMessage(err: QtyError, locale: Locale, rules: QtyRules = DEFAULT_RULES): string | null {
  if (!err) return null;
  const min = fmt(rules.min, locale), max = fmt(rules.max, locale), step = fmt(rules.step, locale);
  const e1 = fmt(rules.min, locale), e2 = fmt(rules.min + rules.step, locale), e3 = fmt(rules.min + 2 * rules.step, locale);
  const t: Record<Locale, Record<Exclude<QtyError, null>, string>> = {
    de: {
      below_min: `Die Mindestbestellmenge beträgt ${min} Stück.`,
      above_max: `Die maximale Bestellmenge beträgt ${max} Stück.`,
      bad_step:  `Bitte geben Sie eine Menge ab ${min} in ${step}er-Schritten ein (z. B. ${e1}, ${e2}, ${e3}).`,
    },
    en: {
      below_min: `The minimum order quantity is ${min} units.`,
      above_max: `The maximum order quantity is ${max} units.`,
      bad_step:  `Please enter a quantity from ${min} in steps of ${step} (e.g. ${e1}, ${e2}, ${e3}).`,
    },
    fr: {
      below_min: `La quantité minimum de commande est de ${min} pièces.`,
      above_max: `La quantité maximum de commande est de ${max} pièces.`,
      bad_step:  `Veuillez saisir une quantité à partir de ${min} par tranches de ${step} (ex. ${e1}, ${e2}, ${e3}).`,
    },
  };
  return t[locale][err];
}
