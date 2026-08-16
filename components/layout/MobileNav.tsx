'use client';
import Link from 'next/link';
import { configuratorPath, sectionPath } from '@/lib/routing';
import type { Locale } from '@/i18n/config';
import type { Dict } from '@/i18n';
import { IconHome, IconGrid, IconDrop, IconMenu, IconSpark } from '@/components/ui/icons';
import { useStorefront } from '@/lib/cart/store';
// Deliberate mobile bottom nav; "Gestalten" is the dominant central action.
// Preserves the approved design — every item is now a working action (no 404s).
export default function MobileNav({ locale, dict }: { locale: Locale; dict: Dict }) {
  const { openMenu } = useStorefront();
  return (
    <nav className="mobnav" aria-label={dict.common.menu}>
      <Link href={`/${locale}`}><b><IconHome size={20} /></b>{dict.nav.home}</Link>
      <Link href={sectionPath('products', locale)}><b><IconGrid size={20} /></b>{dict.nav.products}</Link>
      <Link className="central" href={configuratorPath(locale)}><b><IconSpark size={24} /></b>{dict.common.design}</Link>
      <Link href={sectionPath('scents', locale)}><b><IconDrop size={20} /></b>{dict.nav.scents}</Link>
      <button type="button" onClick={openMenu}><b><IconMenu size={20} /></b>{dict.common.menu}</button>
    </nav>
  );
}
