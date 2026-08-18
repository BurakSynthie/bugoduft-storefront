'use client';
import { usePathname, useRouter } from 'next/navigation';
import { locales, localeNames, type Locale } from '@/i18n/config';
import { seg, matchSection } from '@/lib/routing';

// Language switch keeps you on the SAME localized route (configurator, section
// indexes) and preserves the query string — so the configurator draft (kept in
// localStorage, locale-independent) continues at the same step. Item pages with
// per-locale slugs fall back to the server-provided alternates.
export default function LanguageSwitcher({ current, alternates }:
  { current: Locale; alternates: Partial<Record<Locale, string>> }) {
  const router = useRouter();
  const pathname = usePathname() || `/${current}`;

  function hrefFor(target: Locale): string {
    const search = typeof window !== 'undefined' ? window.location.search : '';
    const parts = pathname.split('/').filter(Boolean); // [locale, seg1, seg2?]
    if (parts[0] !== current) return alternates[target] ?? `/${target}`;
    const first = parts[1];
    if (!first) return `/${target}${search}`;                       // home
    const section = matchSection(current, first);
    if (section && parts.length === 2) return `/${target}/${seg[section][target]}${search}`;
    return alternates[target] ?? `/${target}`;                      // item pages / unknown
  }

  return (
    <div className="switch" role="group" aria-label="Sprache / Language">
      {locales.map(l => (
        <button key={l} aria-current={l === current} lang={l}
          onClick={() => router.push(hrefFor(l))} title={localeNames[l]}>
          {l.toUpperCase()}
        </button>
      ))}
    </div>
  );
}
