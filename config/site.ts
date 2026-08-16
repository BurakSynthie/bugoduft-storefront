import { defaultLocale, locales } from '@/i18n/config';

// Centralized site/business settings. Future features read these instead of hard-coding.
export const business = {
  whatsappNumber: '',                 // E.164, e.g. '+49...' — set when available
  whatsappDefaultMessage: 'Hallo BUGO DUFT, ich interessiere mich für individuelle Duftanhänger.',
  adminNotificationEmail: 'bugoduft@gmail.com',
  defaultCurrency: 'EUR' as const,
  sourceLocale: defaultLocale,
  supportedLocales: locales,
  // Locked manufacturing rules (not paid options):
  manufacturing: {
    cordColor: 'black' as const,      // permanently black; no selector
    differentFrontBackAllowed: true,  // no surcharge
    sharedDieCutShape: true,          // both sides share outer shape
    customContourSurcharge: false,
    individualPackagingSurcharge: false,
  },
  quantity: { min: 1000, step: 1000, max: 100000 },
} as const;

export const site = {
  name: 'BUGO DUFT',
  url: (process.env.NEXT_PUBLIC_SITE_URL ?? 'https://bugoduft.de').replace(/\/$/, ''),
  adminEmail: 'bugoduft@gmail.com',
  defaultOgImage: '/og/bugoduft-default.png',
};
export function abs(path: string) { return `${site.url}${path.startsWith('/') ? path : `/${path}`}`; }
