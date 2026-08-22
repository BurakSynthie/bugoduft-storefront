'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import type { Locale } from '@/i18n/config';
import type { Dict } from '@/i18n';
import { IconSearch, IconMenu } from '@/components/ui/icons';
import { Button } from '@/components/ui';
import LanguageSwitcher from './LanguageSwitcher';
import QuickLangSwitcher from './QuickLangSwitcher';
import CurrencySwitcher from './CurrencySwitcher';
import CartButton from '@/components/storefront/CartButton';
import { useStorefront } from '@/lib/cart/store';

type NavItem = { label: string; href: string };
export default function Header({ locale, dict, nav, alternates, brand, brandLogo }:
  { locale: Locale; dict: Dict; nav: NavItem[]; alternates: Partial<Record<Locale,string>>; brand?: string; brandLogo?: string | null }) {
  const [scrolled, setScrolled] = useState(false);
  const { openSearch, openMenu } = useStorefront();
  useEffect(() => {
    let t = false;
    const onScroll = () => { if (t) return; t = true;
      requestAnimationFrame(() => { setScrolled(window.scrollY > 8); t = false; }); };
    window.addEventListener('scroll', onScroll, { passive: true }); onScroll();
    return () => window.removeEventListener('scroll', onScroll);
  }, []);
  // §B single brand source for the header logo (text fallback when no logo asset is set).
  const brandLabel = brand || 'BUGO DUFT';
  return (
    <header className={`header ${scrolled ? 'header--scrolled' : ''}`}>
      <div className="container header__inner">
        <Link className="logo" href={`/${locale}`}>
          {brandLogo
            ? <img className="logo__img" src={brandLogo} alt={brandLabel} />
            : <><span className="logo__mark" /><span className="logo__text">{brandLabel}</span></>}
        </Link>
        <nav className="nav" aria-label={dict.common.menu}>
          {nav.map(n => <Link key={n.href} href={n.href}>{n.label}</Link>)}
        </nav>
        <div className="header__actions">
          {/* §P compact mobile header: Logo | language | search | cart | menu.
              Language stays visible via the compact switcher; Account moves into the burger
              drawer to keep the small-viewport header within the screen width. */}
          <div className="hide-mobile"><LanguageSwitcher current={locale} alternates={alternates} /></div>
          <div className="hide-mobile"><CurrencySwitcher /></div>
          <span className="only-mobile"><QuickLangSwitcher current={locale} alternates={alternates} /></span>
          <button className="iconbtn" aria-label={dict.common.search} onClick={openSearch}><IconSearch /></button>
          {/* §v1.2.5 Account button. It must center its icon exactly like Search and Cart.
              The utility toggle `.hide-mobile` sets `display:initial` at desktop widths, which
              (being defined later than `.iconbtn`) OVERRODE `.iconbtn{display:inline-flex}` on the
              link itself, dropping flex centering and pinning the icon to the top-left. Fix: keep
              `hide-mobile` on a WRAPPER span (matching the language/currency/quote controls) so the
              link keeps `.iconbtn` inline-flex centering intact. */}
          <span className="hide-mobile">
            <Link className="iconbtn" href={`/${locale}/konto`} aria-label="Konto">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 4-6 8-6s8 2 8 6"/></svg>
            </Link>
          </span>
          <CartButton locale={locale} />
          <span className="hide-mobile"><Button href={`/${locale}#angebot`} variant="dark">{dict.cta.quote}</Button></span>
          <button className="iconbtn burger" aria-label={dict.common.menu} onClick={openMenu}><IconMenu /></button>
        </div>
      </div>
    </header>
  );
}
