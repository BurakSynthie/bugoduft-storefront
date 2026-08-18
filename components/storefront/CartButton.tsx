'use client';
import { useStorefront } from '@/lib/cart/store';
import { IconCart } from '@/components/ui/icons';
import { sf } from '@/lib/i18n/storefront';
import type { Locale } from '@/i18n/config';

export default function CartButton({ locale }: { locale: Locale }) {
  const { count, openCart } = useStorefront();
  const t = sf(locale);
  return (
    <button className="iconbtn cartbtn" aria-label={`${t.cart}${count ? ` — ${count} ${t.cartCount}` : ''}`} onClick={openCart}>
      <IconCart />
      {count > 0 && <span className="cartbtn__badge" aria-hidden="true">{count}</span>}
      <span className="sr-only" role="status">{count} {t.cartCount}</span>
    </button>
  );
}
