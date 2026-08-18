import type { Locale } from '@/i18n/config';
const intlLocale: Record<Locale, string> = { de:'de-DE', en:'en-IE', fr:'fr-FR' };
// Money is stored/computed in integer minor units. Never binary floats in business logic.
export function formatMoney(cents: number, currency: string, locale: Locale): string {
  return new Intl.NumberFormat(intlLocale[locale], { style:'currency', currency }).format(cents / 100);
}
export function formatQty(n: number, locale: Locale): string {
  return new Intl.NumberFormat(intlLocale[locale]).format(n);
}

// ---- Admin money editing: cents <-> localized EUR string (integer-safe) ----
// Admins edit "269,00" / "1.234,56"; storage stays integer cents.
export function centsToInput(cents: number, locale: Locale = 'de'): string {
  return new Intl.NumberFormat(intlLocale[locale], { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    .format(cents / 100);
}
// Parse a localized amount to integer cents without float drift. Returns null if invalid.
export function inputToCents(value: string): number | null {
  const s = value.trim().replace(/[€\s]/g, '');
  if (!s) return null;
  // normalize: strip thousands sep, unify decimal comma/point
  let norm = s;
  if (s.includes(',') && s.includes('.')) norm = s.replace(/\./g, '').replace(',', '.');   // de: 1.234,56
  else if (s.includes(',')) norm = s.replace(',', '.');                                      // 269,00
  if (!/^\d+(\.\d{0,2})?$/.test(norm)) return null;
  const [whole, frac = ''] = norm.split('.');
  const cents = Number(whole) * 100 + Number((frac + '00').slice(0, 2));
  return Number.isFinite(cents) ? cents : null;
}
