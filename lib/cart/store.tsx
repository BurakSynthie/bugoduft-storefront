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

  // §v1.2.6 B1 — iOS-safe background scroll lock. `body{overflow:hidden}` alone does NOT stop
  // touch scrolling of the document on iOS Safari, and it also loses the scroll position. We use
  // the position:fixed technique: capture scrollY, pin the body with `top:-scrollY` (so the
  // background stays VISUALLY in place behind the overlay), and on close restore the exact
  // position with no jump. The lock is keyed on whether ANY overlay is open, so transitions like
  // Menu→Search→Cart never unlock/relock (no visible jump). A ref guards against double lock.
  const scrollYRef = useRef(0);
  const lockedRef = useRef(false);
  useEffect(() => {
    const lock = () => {
      if (lockedRef.current) return;
      lockedRef.current = true;
      scrollYRef.current = window.scrollY || window.pageYOffset || 0;
      const b = document.body;
      b.style.position = 'fixed';
      b.style.top = `-${scrollYRef.current}px`;
      b.style.left = '0';
      b.style.right = '0';
      b.style.width = '100%';
      b.style.overflow = 'hidden';
      b.classList.add('overlay-open');
      document.documentElement.style.overscrollBehavior = 'none';
    };
    const unlock = () => {
      if (!lockedRef.current) return;
      lockedRef.current = false;
      const b = document.body;
      b.style.position = '';
      b.style.top = '';
      b.style.left = '';
      b.style.right = '';
      b.style.width = '';
      b.style.overflow = '';
      b.classList.remove('overlay-open');
      document.documentElement.style.overscrollBehavior = '';
      window.scrollTo(0, scrollYRef.current);   // restore exact position — no jump to top
    };
    if (overlay) lock(); else unlock();
    // Safety net: if the provider ever unmounts while locked, restore the document.
    return () => { if (!overlay) return; /* keep lock across overlay→overlay transitions */ };
  }, [overlay]);
  // Restore on true unmount (defensive; provider normally lives for the whole session).
  useEffect(() => () => {
    if (!lockedRef.current) return;
    const b = document.body;
    b.style.position = ''; b.style.top = ''; b.style.left = ''; b.style.right = '';
    b.style.width = ''; b.style.overflow = '';
    b.classList.remove('overlay-open');
    document.documentElement.style.overscrollBehavior = '';
    window.scrollTo(0, scrollYRef.current);
  }, []);

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
