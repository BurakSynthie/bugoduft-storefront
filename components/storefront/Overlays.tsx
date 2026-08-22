'use client';
import type { Dict } from '@/i18n';
import type { Locale } from '@/i18n/config';
import CartDrawer from './CartDrawer';
import MobileMenu from './MobileMenu';
import SearchOverlay from './SearchOverlay';

type NavItem = { label: string; href: string };
export default function Overlays({ locale, dict, alternates, navLabels }:
  { locale: Locale; dict: Dict; alternates: Partial<Record<Locale, string>>; navLabels?: NavItem[] }) {
  return (
    <>
      <CartDrawer locale={locale} />
      <MobileMenu locale={locale} dict={dict} alternates={alternates} navLabels={navLabels} />
      <SearchOverlay locale={locale} />
    </>
  );
}
