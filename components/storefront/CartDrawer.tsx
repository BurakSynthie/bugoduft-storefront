'use client';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useStorefront } from '@/lib/cart/store';
import type { CartItem } from '@/lib/cart/types';
import { checkoutCartItem } from '@/lib/cart/checkout-client';
import { formatMoney, formatQty } from '@/lib/money';
import { sf } from '@/lib/i18n/storefront';
import { configuratorPath } from '@/lib/routing';
import { saveDraft, setLive, refFromMeta } from '@/lib/configurator/draft';
import { itemToDraft } from '@/lib/cart/edit';
import { IconCart } from '@/components/ui/icons';
import type { Locale } from '@/i18n/config';

// itemToDraft (loading a cart item back into the configurator draft so "Bearbeiten" re-opens the
// SAME configuration — same configId → re-adding updates in place, no duplicate) now lives in the
// pure, unit-tested lib/cart/edit.ts so designMode / scentCode2 / artwork paths can't be dropped.

export default function CartDrawer({ locale }: { locale: Locale }) {
  const { items, overlay, close, remove, totalCents } = useStorefront();
  const router = useRouter();
  const t = sf(locale);
  const open = overlay === 'cart';
  const panelRef = useRef<HTMLDivElement>(null);
  // §Analytics 3B — remembers cart items already counted as begin_checkout so retries / rerenders
  // never double-fire. Cleared per drawer session below.
  const beganCheckout = useRef<Set<string>>(new Set());
  const [busy, setBusy] = useState<string | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
    document.addEventListener('keydown', onKey);
    panelRef.current?.focus();
    return () => document.removeEventListener('keydown', onKey);
  }, [open, close]);

  useEffect(() => { if (!open) { setConfirmId(null); setError(null); } }, [open]);

  function edit(item: CartItem) {
    saveDraft(itemToDraft(item));
    setLive(item.configId);
    close();
    router.push(configuratorPath(locale, item.collectionCode));
  }

  async function checkout(item: CartItem) {
    if (busy) return;
    setBusy(item.cartItemId); setError(null);
    // refFromMeta keeps types honest even though checkout uses stored paths / session files
    void refFromMeta(item.frontMeta);
    const res = await checkoutCartItem(item, t.checkoutErr);
    if (res.ok) {
      // §Analytics 3B — genuine checkout boundary: the server accepted the item and returned a
      // checkout URL (user committed, not merely opened the drawer). Fire once per item via the
      // consent-aware abstraction; guarded against retries/rerenders and wrapped so analytics can
      // never block or delay the redirect.
      if (!beganCheckout.current.has(item.cartItemId)) {
        beganCheckout.current.add(item.cartItemId);
        try { window.bugoTrack?.('begin_checkout', { item_id: item.collectionCode, quantity: item.quantity, value: item.priceCents/100, currency: 'EUR' }); } catch {}
      }
      window.location.href = res.url; return;
    }
    setError(res.message); setBusy(null);
  }

  return (
    <div className={`sfdrawer sfdrawer--right${open ? ' is-open' : ''}`} aria-hidden={!open}>
      <div className="sfdrawer__scrim" onClick={close} />
      <div className="sfdrawer__panel" role="dialog" aria-modal="true" aria-label={t.cart}
        ref={panelRef} tabIndex={-1}>
        <header className="sfdrawer__head">
          <strong>{t.cart}{items.length ? ` · ${items.length}` : ''}</strong>
          <button className="sficon" aria-label={t.close} onClick={close}>×</button>
        </header>

        {items.length === 0 ? (
          <div className="cart-empty">
            <span className="cart-empty__icon" aria-hidden="true"><IconCart size={26} /></span>
            <b>{t.cartEmptyTitle}</b>
            <p className="muted">{t.cartEmptyBody}</p>
            <button className="btn btn--primary" onClick={() => { close(); router.push(configuratorPath(locale)); }}>
              {t.cartEmptyCta}
            </button>
          </div>
        ) : (
          <>
            <div className="sfdrawer__body">
              {items.length > 1 && <p className="cart-multinote muted">{t.multiNote}</p>}
              {items.map(item => (
                <article className="cart-item" key={item.cartItemId}>
                  <div className="cart-item__top">
                    <div>
                      <b>{item.collectionName}</b>
                      <div className="cart-item__qty">{formatQty(item.quantity, locale)} {t.pieces}</div>
                    </div>
                    <div className="price">{formatMoney(item.priceCents, 'EUR', locale)}</div>
                  </div>
                  <dl className="cart-item__meta">
                    <div><dt>{sfScent(locale)}</dt><dd>{item.scentName ?? '—'}</dd></div>
                    {item.scentName2 && <div><dt>{sfScent(locale)} 2</dt><dd>{item.scentName2} ({locale==='de'?'kostenlos':locale==='fr'?'gratuit':'free'})</dd></div>}
                    <div><dt>{sfIntensity(locale)}</dt><dd>{item.intensity === 'intense' ? t.intense : t.normal}</dd></div>
                    <div><dt>{sfShape(locale)}</dt><dd>{item.shapeLabel}</dd></div>
                    <div><dt>{t.front}</dt><dd className="ellip">{item.frontName ?? '—'}</dd></div>
                    <div><dt>{t.back}</dt><dd className="ellip">{item.sameBackAsFront ? t.identical : (item.backName ?? '—')}</dd></div>
                  </dl>

                  {confirmId === item.cartItemId ? (
                    <div className="cart-confirm">
                      <span>{t.removeConfirm}</span>
                      <div className="cart-confirm__row">
                        <button className="btn btn--ghost btn--sm" onClick={() => setConfirmId(null)}>{t.no}</button>
                        <button className="btn btn--danger btn--sm" onClick={() => { remove(item.cartItemId); setConfirmId(null); }}>{t.yes}</button>
                      </div>
                    </div>
                  ) : (
                    <div className="cart-item__actions">
                      <button className="linkbtn" onClick={() => edit(item)}>{t.edit}</button>
                      <button className="linkbtn linkbtn--muted" onClick={() => setConfirmId(item.cartItemId)}>{t.remove}</button>
                      <button className="btn btn--primary btn--sm cart-item__co"
                        disabled={busy === item.cartItemId} aria-busy={busy === item.cartItemId}
                        onClick={() => checkout(item)}>
                        {busy === item.cartItemId ? t.preparing : t.toCheckout}
                      </button>
                    </div>
                  )}
                </article>
              ))}
              {error && <p className="cfg-error" role="alert">{error}</p>}
            </div>

            <footer className="sfdrawer__foot">
              <div className="cart-total">
                <span className="muted">{t.total}</span>
                <span className="price">{formatMoney(totalCents, 'EUR', locale)}</span>
              </div>
              {items.length === 1 && (
                <button className="btn btn--primary btn--block" disabled={!!busy} aria-busy={!!busy}
                  onClick={() => checkout(items[0])}>
                  {busy ? t.preparing : t.toCheckout}
                </button>
              )}
            </footer>
          </>
        )}
      </div>
    </div>
  );
}

// tiny localized labels reused from the configurator vocabulary
const sfScent = (l: Locale) => ({ de: 'Duft', en: 'Scent', fr: 'Parfum' }[l]);
const sfIntensity = (l: Locale) => ({ de: 'Intensität', en: 'Intensity', fr: 'Intensité' }[l]);
const sfShape = (l: Locale) => ({ de: 'Form', en: 'Shape', fr: 'Forme' }[l]);
