import 'server-only';

import { cookies } from 'next/headers';
import { parseConsentCookie } from '@/lib/consent';

export type CheckoutAttribution = {
  analyticsConsent: boolean;
  marketingConsent: boolean;
  gaClientId: string | null;
  metaFbp: string | null;
  metaFbc: string | null;
};

function clean(value: string | undefined, max = 255): string | null {
  if (!value) return null;
  const v = value.trim();
  return v ? v.slice(0, max) : null;
}

function gaClientIdFromCookie(value: string | undefined): string | null {
  const v = clean(value);
  if (!v) return null;

  const parts = v.split('.');
  if (parts.length >= 4 && /^GA\d+$/i.test(parts[0])) {
    return parts.slice(2).join('.');
  }

  return v;
}

export async function getCheckoutAttribution(): Promise<CheckoutAttribution> {
  const store = await cookies();
  const consent = parseConsentCookie(store.get('bugo_consent_v2')?.value);

  const analyticsConsent = !!consent?.analytics;
  const marketingConsent = !!consent?.marketing;

  return {
    analyticsConsent,
    marketingConsent,
    gaClientId: analyticsConsent ? gaClientIdFromCookie(store.get('_ga')?.value) : null,
    metaFbp: marketingConsent ? clean(store.get('_fbp')?.value) : null,
    metaFbc: marketingConsent ? clean(store.get('_fbc')?.value) : null,
  };
}

export function checkoutAttributionAttributes(a: CheckoutAttribution) {
  return [
    { key: 'BUGO Analytics Consent', value: a.analyticsConsent ? '1' : '0' },
    { key: 'BUGO Marketing Consent', value: a.marketingConsent ? '1' : '0' },
    ...(a.gaClientId ? [{ key: 'BUGO GA Client ID', value: a.gaClientId }] : []),
    ...(a.metaFbp ? [{ key: 'BUGO Meta FBP', value: a.metaFbp }] : []),
    ...(a.metaFbc ? [{ key: 'BUGO Meta FBC', value: a.metaFbc }] : []),
  ];
}
