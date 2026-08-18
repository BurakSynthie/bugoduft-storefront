'use server';
import type { Locale } from '@/i18n/config';
import { beginSampleCheckout, type SampleCheckoutResult } from '@/repositories/samples';

export async function beginSampleCheckoutAction(locale: Locale): Promise<SampleCheckoutResult> {
  return beginSampleCheckout(locale);
}
