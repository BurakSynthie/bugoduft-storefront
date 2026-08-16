'use client';
import { useRouter } from 'next/navigation';
import { locales, localeNames, type Locale } from '@/i18n/config';
export default function LanguageSwitcher({ current, alternates }:
  { current: Locale; alternates: Partial<Record<Locale, string>> }) {
  const router = useRouter();
  return (
    <div className="switch" role="group" aria-label="Sprache / Language">
      {locales.map(l => (
        <button key={l} aria-current={l === current} lang={l}
          onClick={() => router.push(alternates[l] ?? `/${l}`)} title={localeNames[l]}>
          {l.toUpperCase()}
        </button>
      ))}
    </div>
  );
}
