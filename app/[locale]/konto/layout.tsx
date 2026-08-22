import type { ReactNode } from 'react';
import type { Metadata } from 'next';

// §SEO Account/auth area is private: never index or follow these pages. Applied at the nearest
// shared layout level so every /{locale}/konto/* route (DE/EN/FR share the fixed `konto`
// segment) inherits noindex without affecting any public marketing/product/content page.
// Passthrough layout only — the parent [locale] layout owns <html>/<body> and the site chrome.
export const metadata: Metadata = { robots: { index: false, follow: false } };

export default function KontoLayout({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
