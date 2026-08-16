import type { ReactNode } from 'react';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import '../globals.css';
import { locales, htmlLang, isLocale, type Locale } from '@/i18n/config';
import { getDict } from '@/i18n';
import { site } from '@/config/site';
import { sectionPath } from '@/lib/routing';
import { homeAlternates } from '@/repositories/catalog';
import Header from '@/components/layout/Header';
import Footer from '@/components/layout/Footer';
import MobileNav from '@/components/layout/MobileNav';
import CookieBar from '@/components/layout/CookieBar';
import AnnouncementBar from '@/components/layout/AnnouncementBar';
import { getHome } from '@/data/seed/homepage';
import { StorefrontProvider } from '@/lib/cart/store';
import Overlays from '@/components/storefront/Overlays';

export function generateStaticParams() { return locales.map(locale => ({ locale })); }

export async function generateMetadata({ params }: { params: { locale: string } }): Promise<Metadata> {
  const locale = (isLocale(params.locale) ? params.locale : 'de') as Locale;
  return {
    metadataBase: new URL(site.url),
    title: { default: 'BUGO DUFT', template: '%s | BUGO DUFT' },
    applicationName: site.name,
    icons: { icon: '/favicon.svg' },
    openGraph: { siteName: site.name, locale: htmlLang[locale] },
  };
}

export default function LocaleLayout({ children, params }:
  { children: ReactNode; params: { locale: string } }) {
  if (!isLocale(params.locale)) notFound();
  const locale = params.locale as Locale;
  const dict = getDict(locale);
  const home = getHome(locale);
  const nav = [
    { label: dict.nav.products, href: sectionPath('products', locale) },
    { label: dict.nav.scents, href: sectionPath('scents', locale) },
    { label: dict.nav.industries, href: sectionPath('industries', locale) },
    { label: dict.nav.production, href: `/${locale}#produktion` },
    { label: dict.nav.faq, href: `/${locale}#faq` },
  ];
  return (
    <html lang={htmlLang[locale]}>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" />
        <meta name="theme-color" content="#1268E8" />
      </head>
      <body>
        <StorefrontProvider>
          <AnnouncementBar text={home.announcement} />
          <Header locale={locale} dict={dict} nav={nav} alternates={homeAlternates()} />
          <main className="pb-mobnav">{children}</main>
          <Footer locale={locale} dict={dict} />
          <MobileNav locale={locale} dict={dict} />
          <CookieBar dict={dict} />
          <Overlays locale={locale} dict={dict} alternates={homeAlternates()} />
        </StorefrontProvider>
      </body>
    </html>
  );
}
