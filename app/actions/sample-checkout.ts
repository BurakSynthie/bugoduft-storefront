'use server';
import type { Locale } from '@/i18n/config';
import { beginSampleCheckout, type SampleCheckoutResult } from '@/repositories/samples';

// §OPTION-3-v2 #2 the client passes a STABLE idempotency key (a UUID it generates once per logical
// checkout attempt and reuses across HTTP retries), so a retry maps to the SAME sample order and at
// most one payable Draft. A genuinely new purchase uses a new key. The key is validated as a UUID
// server-side; a malformed/absent key is rejected (never used as an idempotency subject blindly).
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function beginSampleCheckoutAction(locale: Locale, checkoutAttemptId: string): Promise<SampleCheckoutResult> {
  if (typeof checkoutAttemptId !== 'string' || !UUID_RE.test(checkoutAttemptId.trim())) {
    return { ok:false, code:'error', message:'Ungültige Checkout-Anfrage.' };
  }
  return beginSampleCheckout(locale, checkoutAttemptId.trim());
}
