import type { Locale } from '@/i18n/config';
export type QtyRules = { min: number; max: number; step: number };
export type QtyError = 'below_min' | 'above_max' | 'bad_step' | null;
// Server-authoritative validation (also mirrored client-side for UX).
export function validateQuantity(qty: number, r: QtyRules): QtyError {
  if (!Number.isFinite(qty) || qty < r.min) return 'below_min';
  if (qty > r.max) return 'above_max';
  if (qty % r.step !== 0) return 'bad_step';
  return null;
}
const messages: Record<Locale, Record<Exclude<QtyError, null>, string>> = {
  de: { below_min:'Die Mindestbestellmenge beträgt 1.000 Stück.',
        above_max:'Die maximale Bestellmenge beträgt 100.000 Stück.',
        bad_step:'Bitte geben Sie eine Menge in 1.000er-Schritten ein (z. B. 1.000, 2.000, 3.000).' },
  en: { below_min:'The minimum order quantity is 1,000 units.',
        above_max:'The maximum order quantity is 100,000 units.',
        bad_step:'Please enter a quantity in steps of 1,000 (e.g. 1,000, 2,000, 3,000).' },
  fr: { below_min:'La quantité minimum de commande est de 1 000 pièces.',
        above_max:'La quantité maximum de commande est de 100 000 pièces.',
        bad_step:'Veuillez saisir une quantité par tranches de 1 000 (ex. 1 000, 2 000, 3 000).' },
};
export function quantityMessage(err: QtyError, locale: Locale): string | null {
  return err ? messages[locale][err] : null;
}
