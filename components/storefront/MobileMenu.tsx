'use client';
import { useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useStorefront } from '@/lib/cart/store';
import { sectionPath, configuratorPath } from '@/lib/routing';
import { sf } from '@/lib/i18n/storefront';
import type { Dict } from '@/i18n';
import { IconSearch, IconSpark } from '@/components/ui/icons';
import type { Locale } from '@/i18n/config';
import LanguageSwitcher from '@/components/layout/LanguageSwitcher';
import CurrencySwitcher from '@/components/layout/CurrencySwitcher';

type NavItem = { label: string; href: string };
export default function MobileMenu({ locale, dict, alternates, navLabels }:
  { locale: Locale; dict: Dict; alternates: Partial<Record<Locale, string>>; navLabels?: NavItem[] }) {
  const { overlay, close, openSearch } = useStorefront();
  const router = useRouter();
  const t = sf(locale);
  const open = overlay === 'menu';
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
    document.addEventListener('keydown', onKey);
    panelRef.current?.focus();
    return () => document.removeEventListener('keydown', onKey);
  }, [open, close]);

  const go = (href: string) => { close(); router.push(href); };

  // §C use the same centralized, admin-editable nav labels as the desktop header when provided,
  // so the desktop header and mobile drawer never drift. Fall back to the static dictionary.
  const links: { label: string; href: string }[] = navLabels && navLabels.length ? [
    { label: dict.nav.home, href: `/${locale}` },
    ...navLabels,
    { label: dict.nav.contact, href: `/${locale}#angebot` },
  ] : [
    { label: dict.nav.home, href: `/${locale}` },
    { label: dict.nav.products, href: sectionPath('products', locale) },
    { label: dict.nav.scents, href: sectionPath('scents', locale) },
    { label: dict.nav.industries, href: sectionPath('industries', locale) },
    { label: locale==='de'?'Duftmuster':locale==='en'?'Fragrance Sample':'Échantillons', href: sectionPath('sample', locale) },
    { label: dict.nav.production, href: sectionPath('production', locale) },
    { label: dict.nav.faq, href: `/${locale}#faq` },
    { label: dict.nav.contact, href: `/${locale}#angebot` },
  ];
  // §P Account entry lives in the drawer as a real link (moved out of the tight mobile header).
  const accountLabel = locale==='de' ? 'Mein Konto' : locale==='en' ? 'My Account' : 'Mon compte';

  return (
    <div className={`sfdrawer sfdrawer--left${open ? ' is-open' : ''}`} aria-hidden={!open}>
      <div className="sfdrawer__scrim" onClick={close} />
      <div className="sfdrawer__panel" role="dialog" aria-modal="true" aria-label={t.menu}
        ref={panelRef} tabIndex={-1}>
        <header className="sfdrawer__head">
          <strong>{t.menu}</strong>
          <button className="sficon" aria-label={t.close} onClick={close}>×</button>
        </header>

        {/* §v1.2.6 B2 — scrollable region: only the drawer content scrolls (background is locked
            by the provider). flex:1 + min-height:0 + overscroll-behavior:contain keep the lower
            controls (account, language, currency) reachable within the visible viewport, with
            safe-area bottom padding so nothing hides behind the iPhone home indicator. */}
        <div className="mm-scroll">
          <button className="menu-search" onClick={() => openSearch()}>
            <IconSearch size={18} /><span>{t.searchPh}</span>
          </button>

          <nav className="menu-nav" aria-label={t.menu}>
            {links.map(l => (
              <button key={l.href} className="menu-nav__item" onClick={() => go(l.href)}>{l.label}</button>
            ))}
          </nav>

          <button className="btn btn--primary menu-cta" onClick={() => go(configuratorPath(locale))}>
            <IconSpark size={18} /> {dict.cta.configure}
          </button>

          <button className="menu-nav__item menu-account-link" onClick={() => go(`/${locale}/konto`)}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ marginRight: '.5rem', verticalAlign: 'middle' }}><circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 4-6 8-6s8 2 8 6"/></svg>
            {accountLabel}
          </button>

          <div className="menu-prefs">
            <div className="menu-pref">
              <span className="menu-pref__label">{t.language}</span>
              <LanguageSwitcher current={locale} alternates={alternates} />
            </div>
            <div className="menu-pref">
              <span className="menu-pref__label">{t.currency}</span>
              <CurrencySwitcher />
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
