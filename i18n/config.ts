export const locales = ['de', 'en', 'fr'] as const;
export type Locale = (typeof locales)[number];
export const defaultLocale: Locale = 'de';        // German is the source language
export const localeNames: Record<Locale, string> = { de: 'Deutsch', en: 'English', fr: 'Français' };
export const htmlLang: Record<Locale, string> = { de: 'de-DE', en: 'en', fr: 'fr' };
export function isLocale(x: string): x is Locale { return (locales as readonly string[]).includes(x); }
