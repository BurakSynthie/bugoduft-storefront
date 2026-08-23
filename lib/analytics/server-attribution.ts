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
  // §hide-internal These are INTERNAL attribution/consent values consumed by the server-side
  // Purchase pipeline (lib/analytics/server-purchase.ts → GA4 Measurement Protocol + Meta CAPI).
  // Underscore-prefixed line-item property keys are hidden by Shopify's customer-facing surfaces
  // (cart, checkout, order-confirmation email) but REMAIN on the order and readable via the Admin
  // API / order webhook — so GA4/CAPI/Purchase attribution keep working unchanged. The readers in
  // server-purchase.ts match BOTH the new '_BUGO …' keys and the legacy 'BUGO …' keys, so orders
  // created before this change still attribute correctly.
  return [
    { key: '_BUGO Analytics Consent', value: a.analyticsConsent ? '1' : '0' },
    { key: '_BUGO Marketing Consent', value: a.marketingConsent ? '1' : '0' },
    ...(a.gaClientId ? [{ key: '_BUGO GA Client ID', value: a.gaClientId }] : []),
    ...(a.metaFbp ? [{ key: '_BUGO Meta FBP', value: a.metaFbp }] : []),
    ...(a.metaFbc ? [{ key: '_BUGO Meta FBC', value: a.metaFbc }] : []),
  ];
}
