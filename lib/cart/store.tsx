'use client';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { CartItem } from './types';
import { CART_KEY } from './types';

type Overlay = 'cart' | 'menu' | 'search' | null;

type Ctx = {
  items: CartItem[];
  count: number;
  totalCents: number;
  addOrUpdate: (item: CartItem) => void;   // upsert keyed by configId
  remove: (cartItemId: string) => void;
  overlay: Overlay;
  openCart: () => void;
  openMenu: () => void;
  openSearch: () => void;
  close: () => void;
};

const StorefrontCtx = createContext<Ctx | null>(null);

function readCart(): CartItem[] {
  try {
    const raw = localStorage.getItem(CART_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? (arr as CartItem[]) : [];
  } catch { return []; }
}

export function StorefrontProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<CartItem[]>([]);
  const [overlay, setOverlay] = useState<Overlay>(null);
  const hydrated = useRef(false);

  // hydrate from localStorage once, then keep in sync across tabs
  useEffect(() => {
    setItems(readCart());
    hydrated.current = true;
    const onStorage = (e: StorageEvent) => { if (e.key === CART_KEY) setItems(readCart()); };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  // persist on change (only after hydration, so we never clobber saved data)
  useEffect(() => {
    if (!hydrated.current) return;
    try { localStorage.setItem(CART_KEY, JSON.stringify(items)); } catch { /* quota */ }
  }, [items]);

  const addOrUpdate = useCallback((item: CartItem) => {
    setItems(prev => {
      const i = prev.findIndex(x => x.configId === item.configId);
      if (i === -1) return [...prev, item];
      const next = prev.slice(); next[i] = item; return next;   // edit updates in place
    });
  }, []);

  const remove = useCallback((cartItemId: string) => {
    setItems(prev => prev.filter(x => x.cartItemId !== cartItemId));
  }, []);

  // body scroll lock while any overlay is open
  useEffect(() => {
    if (overlay) { document.body.classList.add('overlay-open'); }
    else { document.body.classList.remove('overlay-open'); }
    return () => document.body.classList.remove('overlay-open');
  }, [overlay]);

  const value = useMemo<Ctx>(() => ({
    items,
    count: items.length,                                   // configured entries, not piece count
    totalCents: items.reduce((s, x) => s + x.priceCents, 0),
    addOrUpdate, remove,
    overlay,
    openCart: () => setOverlay('cart'),
    openMenu: () => setOverlay('menu'),
    openSearch: () => setOverlay('search'),
    close: () => setOverlay(null),
  }), [items, overlay, addOrUpdate, remove]);

  return <StorefrontCtx.Provider value={value}>{children}</StorefrontCtx.Provider>;
}

export function useStorefront(): Ctx {
  const c = useContext(StorefrontCtx);
  if (!c) throw new Error('useStorefront must be used within StorefrontProvider');
  return c;
}
