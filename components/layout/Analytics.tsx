'use client';
import { useEffect } from 'react';
import { readConsent } from '@/lib/consent';

// §4/§5/§6 Analytics loader.
// - GA4/GTM require ANALYTICS consent; Meta Pixel requires MARKETING consent.
// - analyticsMode 'direct' loads GA4 directly; 'gtm' loads GTM only (GA4 is managed inside
//   the container) — the two never both fire GA4, preventing duplicate page views.
// - Injection is guarded so nothing loads twice; re-runs when consent is upgraded.
// - Provides a tiny window.bugoTrack(event, params) helper for real commerce events.
//   Purchase is intentionally NOT fired client-side — the Shopify paid webhook is the truth.
declare global {
  interface Window {
    dataLayer?: any[]; gtag?: (...a: any[]) => void; fbq?: any;
    _bugoTrackers?: Record<string, boolean>;
    bugoTrack?: (event: string, params?: Record<string, any>) => void;
  }
}

export default function Analytics({ ga4Id, gtmId, metaPixelId, analyticsMode }:
  { ga4Id: string; gtmId: string; metaPixelId: string; analyticsMode: 'direct' | 'gtm' }) {
  useEffect(() => {
    const useGtm = analyticsMode === 'gtm';
    const directGa4 = useGtm ? '' : ga4Id;   // in GTM mode GA4 is managed by the container
    const gtm = useGtm ? gtmId : '';

    const load = () => {
      const consent = readConsent();
      const analytics = !!consent?.analytics;
      const marketing = !!consent?.marketing;
      window._bugoTrackers = window._bugoTrackers || {};
      const once = (k: string) => (window._bugoTrackers![k] ? true : ((window._bugoTrackers![k] = true), false));

      if (analytics && directGa4 && !once('ga4:' + directGa4)) {
        const s = document.createElement('script');
        s.async = true; s.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(directGa4)}`;
        document.head.appendChild(s);
        window.dataLayer = window.dataLayer || [];
        window.gtag = function () { window.dataLayer!.push(arguments); };
        window.gtag('js', new Date());
        window.gtag('consent', 'default', { analytics_storage: 'granted' });
        window.gtag('config', directGa4);
      }
      if (analytics && gtm && !once('gtm:' + gtm)) {
        window.dataLayer = window.dataLayer || [];
        window.dataLayer.push({ 'gtm.start': Date.now(), event: 'gtm.js' });
        const s = document.createElement('script');
        s.async = true; s.src = `https://www.googletagmanager.com/gtm.js?id=${encodeURIComponent(gtm)}`;
        document.head.appendChild(s);
      }
      if (marketing && metaPixelId && !once('meta:' + metaPixelId)) {
        /* eslint-disable */
        (function (f: any, b: any, e: any, v?: any, n?: any, t?: any, s?: any) {
          if (f.fbq) return; n = f.fbq = function () { n.callMethod ? n.callMethod.apply(n, arguments) : n.queue.push(arguments); };
          if (!f._fbq) f._fbq = n; n.push = n; n.loaded = true; n.version = '2.0'; n.queue = [];
          t = b.createElement(e); t.async = true; t.src = 'https://connect.facebook.net/en_US/fbevents.js';
          s = b.getElementsByTagName(e)[0]; s.parentNode.insertBefore(t, s);
        })(window, document, 'script');
        /* eslint-enable */
        window.fbq('init', metaPixelId); window.fbq('track', 'PageView');
      }
    };

    // Tiny normalized event helper. Safe no-op when the relevant tracker/consent is absent;
    // never throws, so it can never block checkout or configurator flow.
    window.bugoTrack = (event: string, params: Record<string, any> = {}) => {
      try {
        const consent = readConsent();
        if (event === 'purchase') return;   // never fire purchase client-side
        if (consent?.analytics) {
          if (window.gtag) window.gtag('event', event, params);
          else if (window.dataLayer) window.dataLayer.push({ event, ...params });
        }
        if (consent?.marketing && window.fbq) {
          const map: Record<string, string> = { view_product: 'ViewContent', begin_checkout: 'InitiateCheckout', add_to_cart: 'AddToCart', quote_submit: 'Lead' };
          if (map[event]) window.fbq('track', map[event], params);
        }
      } catch {}
    };

    load();
    const onConsent = () => load();
    window.addEventListener('bugo:consent-changed', onConsent);
    return () => window.removeEventListener('bugo:consent-changed', onConsent);
  }, [ga4Id, gtmId, metaPixelId, analyticsMode]);

  return null;
}
