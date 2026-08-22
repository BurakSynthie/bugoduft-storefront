'use client';
import { useEffect, useRef } from 'react';

// §Analytics 3A — emit the project-level `view_product` event exactly once when a real product
// detail page is viewed. Uses the existing consent-aware window.bugoTrack abstraction (which maps
// to GA4 `view_product` / Meta `ViewContent` and no-ops without consent), so nothing here bypasses
// consent or the analytics layer. Guarded so React StrictMode / rerenders never double-fire, and
// keyed on the product slug so client-side navigation to a *different* product fires again.
export default function TrackProductView({ slug, params }:
  { slug: string; params?: Record<string, any> }) {
  const firedFor = useRef<string | null>(null);
  useEffect(() => {
    if (firedFor.current === slug) return;   // already counted this product view
    firedFor.current = slug;
    try { window.bugoTrack?.('view_product', params ?? {}); } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug]);
  return null;
}
