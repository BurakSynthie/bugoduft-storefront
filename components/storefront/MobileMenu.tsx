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

export default function MobileMenu({ locale, dict, alternates }:
  { locale: Locale; dict: Dict; alternates: Partial<Record<Locale, string>> }) {
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

  const links: { label: string; href: string }[] = [
    { label: dict.nav.home, href: `/${locale}` },
    { label: dict.nav.products, href: sectionPath('products', locale) },
    { label: dict.nav.scents, href: sectionPath('scents', locale) },
    { label: dict.nav.industries, href: sectionPath('industries', locale) },
    { label: locale==='de'?'Duftmuster':locale==='en'?'Fragrance Sample':'Échantillons', href: sectionPath('sample', locale) },
    { label: dict.nav.production, href: `/${locale}#produktion` },
    { label: dict.nav.faq, href: `/${locale}#faq` },
    { label: dict.nav.contact, href: `/${locale}#angebot` },
  ];

  return (
    <div className={`sfdrawer sfdrawer--left${open ? ' is-open' : ''}`} aria-hidden={!open}>
      <div className="sfdrawer__scrim" onClick={close} />
      <div className="sfdrawer__panel" role="dialog" aria-modal="true" aria-label={t.menu}
        ref={panelRef} tabIndex={-1}>
        <header className="sfdrawer__head">
          <strong>{t.menu}</strong>
          <button className="sficon" aria-label={t.close} onClick={close}>×</button>
        </header>

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

        <p className="menu-account muted">{t.accountSoon}</p>
      </div>
    </div>
  );
}
