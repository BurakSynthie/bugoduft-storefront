'use client';
import { useEffect, useRef } from 'react';

// Emits the product-view event once per product.
// The zero-delay deferral lets the root Analytics effect install window.bugoTrack
// before this child effect attempts to use it.
export default function TrackProductView({ slug, params }:
  { slug: string; params?: Record<string, any> }) {
  const firedFor = useRef<string | null>(null);

  useEffect(() => {
    if (firedFor.current === slug) return;

    const timer = window.setTimeout(() => {
      if (firedFor.current === slug) return;

      // Do not mark the product as tracked until the analytics helper is actually ready.
      if (typeof window.bugoTrack !== 'function') return;

      firedFor.current = slug;

      try {
        window.bugoTrack?.('view_product', params ?? {});
      } catch {
        // Allow a later genuine attempt if the call unexpectedly fails.
        firedFor.current = null;
      }
    }, 0);

    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug]);

  return null;
}

