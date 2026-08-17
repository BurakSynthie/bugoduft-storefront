'use client';
import { useEffect, useRef, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { locales, localeNames, type Locale } from '@/i18n/config';
import { seg, matchSection } from '@/lib/routing';

// One-tap language switch from the mobile header. Path-aware (stays on the same
// localized route, preserves the query string incl. ?k=), so the configurator
// draft and product context survive — same logic as the desktop switcher.
export default function QuickLangSwitcher({ current, alternates }:
  { current: Locale; alternates: Partial<Record<Locale, string>> }) {
  const router = useRouter();
  const pathname = usePathname() || `/${current}`;
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDoc); document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDoc); document.removeEventListener('keydown', onKey); };
  }, [open]);

  function hrefFor(target: Locale): string {
    const search = typeof window !== 'undefined' ? window.location.search : '';
    const parts = pathname.split('/').filter(Boolean);
    if (parts[0] !== current) return alternates[target] ?? `/${target}`;
    const first = parts[1];
    if (!first) return `/${target}${search}`;
    const section = matchSection(current, first);
    if (section && parts.length === 2) return `/${target}/${seg[section][target]}${search}`;
    return alternates[target] ?? `/${target}`;
  }

  return (
    <div className="qlang" ref={ref}>
      <button className="qlang__btn" aria-haspopup="menu" aria-expanded={open}
        onClick={() => setOpen(o => !o)} aria-label="Sprache / Language">
        {current.toUpperCase()}
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>
      </button>
      {open && (
        <div className="qlang__pop" role="menu">
          {locales.map(l => (
            <button key={l} role="menuitemradio" aria-checked={l === current} lang={l}
              className={l === current ? 'is-current' : ''}
              onClick={() => { setOpen(false); router.push(hrefFor(l)); }}>
              <b>{l.toUpperCase()}</b> <span>{localeNames[l]}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
