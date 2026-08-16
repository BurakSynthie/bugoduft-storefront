'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import type { Locale } from '@/i18n/config';
import type { Dict } from '@/i18n';
import { IconSearch, IconMenu } from '@/components/ui/icons';
import { Button } from '@/components/ui';
import LanguageSwitcher from './LanguageSwitcher';
import CurrencySwitcher from './CurrencySwitcher';
import CartButton from '@/components/storefront/CartButton';
import { useStorefront } from '@/lib/cart/store';

type NavItem = { label: string; href: string };
export default function Header({ locale, dict, nav, alternates }:
  { locale: Locale; dict: Dict; nav: NavItem[]; alternates: Partial<Record<Locale,string>> }) {
  const [scrolled, setScrolled] = useState(false);
  const { openSearch, openMenu } = useStorefront();
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
          <button className="iconbtn" aria-label={dict.common.search} onClick={openSearch}><IconSearch /></button>
          <CartButton locale={locale} />
          <span className="hide-mobile"><Button href={`/${locale}#angebot`} variant="dark">{dict.cta.quote}</Button></span>
          <button className="iconbtn burger" aria-label={dict.common.menu} onClick={openMenu}><IconMenu /></button>
        </div>
      </div>
    </header>
  );
}
