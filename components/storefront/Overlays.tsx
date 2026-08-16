'use client';
import type { Dict } from '@/i18n';
import type { Locale } from '@/i18n/config';
import CartDrawer from './CartDrawer';
import MobileMenu from './MobileMenu';
import SearchOverlay from './SearchOverlay';

export default function Overlays({ locale, dict, alternates }:
  { locale: Locale; dict: Dict; alternates: Partial<Record<Locale, string>> }) {
  return (
    <>
      <CartDrawer locale={locale} />
      <MobileMenu locale={locale} dict={dict} alternates={alternates} />
      <SearchOverlay locale={locale} />
    </>
  );
}
