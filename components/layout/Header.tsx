'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import type { Locale } from '@/i18n/config';
import type { Dict } from '@/i18n';
import { IconSearch, IconCart, IconMenu } from '@/components/ui/icons';
import { Button } from '@/components/ui';
import LanguageSwitcher from './LanguageSwitcher';
import CurrencySwitcher from './CurrencySwitcher';

type NavItem = { label: string; href: string };
export default function Header({ locale, dict, nav, alternates }:
  { locale: Locale; dict: Dict; nav: NavItem[]; alternates: Partial<Record<Locale,string>> }) {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    let t = false;
    const onScroll = () => { if (t) return; t = true;
      requestAnimationFrame(() => { setScrolled(window.scrollY > 8); t = false; }); };
    window.addEventListener('scroll', onScroll, { passive: true }); onScroll();
    return () => window.removeEventListener('scroll', onScroll);
  }, []);
  return (
    <header className={`header ${scrolled ? 'header--scrolled' : ''}`}>
      <div className="container header__inner">
        <Link className="logo" href={`/${locale}`}><span className="logo__mark" />BUGO&nbsp;DUFT</Link>
        <nav className="nav" aria-label={dict.common.menu}>
          {nav.map(n => <Link key={n.href} href={n.href}>{n.label}</Link>)}
        </nav>
        <div className="header__actions">
          <div className="hide-mobile"><LanguageSwitcher current={locale} alternates={alternates} /></div>
          <div className="hide-mobile"><CurrencySwitcher /></div>
          <button className="iconbtn hide-mobile" aria-label={dict.common.search}><IconSearch /></button>
          <button className="iconbtn" aria-label="Cart"><IconCart /></button>
          <span className="hide-mobile"><Button href={`/${locale}#angebot`} variant="dark">{dict.cta.quote}</Button></span>
          <button className="iconbtn burger" aria-label={dict.common.menu} aria-expanded={open}
            onClick={() => setOpen(o => !o)}><IconMenu /></button>
        </div>
      </div>
      {open && (
        <div className="container" style={{ paddingBottom: 'var(--s-4)' }}>
          <nav aria-label={dict.common.menu} style={{ display:'grid', gap:'.25rem' }}>
            {nav.map(n => <Link key={n.href} href={n.href} onClick={() => setOpen(false)}
              style={{ padding:'.6rem 0', borderBottom:'1px solid var(--border)' }}>{n.label}</Link>)}
          </nav>
          <div style={{ display:'flex', gap:'.5rem', marginTop:'.75rem' }}>
            <LanguageSwitcher current={locale} alternates={alternates} /><CurrencySwitcher />
          </div>
        </div>
      )}
    </header>
  );
}
