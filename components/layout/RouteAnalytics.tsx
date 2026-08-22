'use client';
import { useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';
import { readConsent } from '@/lib/consent';

// §Analytics 3C — route-aware SPA PageView for App Router client-side navigation.
//
// Why this exists: the Analytics loader fires GA4 `config` and Meta `PageView` ONCE on initial
// document load. Next.js App Router client navigations (Link/router.push) change the URL without a
// full reload, so those subsequent views would otherwise go untracked.
//
// Safety rules honored here:
//  - No double-fire of the first load: the initial pathname is recorded and skipped; only genuine
//    route CHANGES emit an event.
//  - No double-fire when GTM owns SPA pageviews: in `gtm` mode GA4 lives inside the container and
//    GTM's History Change trigger already tracks route changes, so we emit NO GA4 page_view here.
//    We only send GA4 page_view in `direct` mode (where nothing else tracks it).
//  - Consent preserved: GA4 requires analytics consent, Meta requires marketing consent, read live
//    on each navigation (never cached), matching the loader's behavior.
//  - Never throws / never touches rendering: pure side-effect in useEffect, all calls guarded.
export default function RouteAnalytics({ analyticsMode }: { analyticsMode: 'direct' | 'gtm' }) {
  const pathname = usePathname();
  const lastPath = useRef<string | null>(null);

  useEffect(() => {
    // First observed path is the initial document load already counted by the loader — record and skip.
    if (lastPath.current === null) { lastPath.current = pathname; return; }
    if (pathname === lastPath.current) return;   // no real change (guards accidental reruns)
    lastPath.current = pathname;

    try {
      const consent = readConsent();
      // GA4 client-side page_view only in direct mode; in GTM mode the container owns it.
      if (analyticsMode === 'direct' && consent?.analytics && typeof window.gtag === 'function') {
        window.gtag('event', 'page_view', {
          page_path: pathname,
          page_location: window.location.href,
          page_title: document.title,
        });
      }
      // Meta Pixel SPA PageView (marketing consent) — GTM mode does not load fbq here.
      if (consent?.marketing && typeof window.fbq === 'function') {
        window.fbq('track', 'PageView');
      }
    } catch {}
  }, [pathname, analyticsMode]);

  return null;
}
