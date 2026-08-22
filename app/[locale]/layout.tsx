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
import QuickContact from '@/components/layout/QuickContact';
import Analytics from '@/components/layout/Analytics';
import RouteAnalytics from '@/components/layout/RouteAnalytics';
import { getHome } from '@/data/seed/homepage';
import { getSettings } from '@/repositories/settings';
import { StorefrontProvider } from '@/lib/cart/store';
import Overlays from '@/components/storefront/Overlays';

export function generateStaticParams() { return locales.map(locale => ({ locale })); }

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale: lp } = await params;              // §HIGH-16 Next.js 15 async params
  const locale = (isLocale(lp) ? lp : 'de') as Locale;
  const settings = await getSettings();
  const og = settings.defaultOgImage || site.defaultOgImage;
  const brand = settings.brandName || site.name;
  // §B favicon/apple-touch come from the admin brand settings; fall back to the shipped
  // /favicon.svg so an unconfigured install keeps a working icon.
  const favicon = settings.brand.favicon || '/favicon.svg';
  const apple = settings.brand.appleTouchIcon || undefined;
  return {
    metadataBase: new URL(site.url),
    // §B single brand source: default title + suffix template both use the admin brand.
    title: { default: brand, template: `%s | ${brand}` },
    applicationName: brand,
    icons: { icon: favicon, ...(apple ? { apple } : {}) },
    openGraph: { siteName: brand, locale: htmlLang[locale],
      images: og ? [{ url: og.startsWith('http') ? og : `${site.url}${og}` }] : undefined },
  };
}

export default async function LocaleLayout({ children, params }:
  { children: ReactNode; params: Promise<{ locale: string }> }) {
  const { locale: lp } = await params;              // §HIGH-16 Next.js 15 async params
  if (!isLocale(lp)) notFound();
  const locale = lp as Locale;
  const dict = getDict(locale);
  const home = getHome(locale);
  const settings = await getSettings();
  const brandName = settings.brandName || site.name;
  const ann = settings.announcement;
  // Before an admin has ever saved Ayarlar (`configured === false`), keep the shipped
  // seed announcement so nothing regresses. Once configured, the admin's `enabled`
  // toggle is authoritative — explicit OFF must render NOTHING, never fall back.
  const annText = !ann.configured
    ? home.announcement
    : (ann.enabled ? ann.text[locale] : '');
  // §D each locale navigates to its OWN href; fall back to the legacy single href only if a
  // locale-specific one was never entered, so EN/FR visitors are never sent to a DE-only URL.
  const annHref = ann.configured && ann.enabled
    ? (ann.hrefL10n[locale] || ann.href || undefined) : undefined;
  const annLabel = ann.configured && ann.enabled ? (ann.linkLabel[locale] || undefined) : undefined;
  // §C centralized, admin-editable navigation LABELS (routes stay fixed in code). Empty admin
  // values fall back to the static i18n dictionary so an unconfigured install never regresses.
  const nl = settings.navLabels;
  const nav = [
    { label: nl.products[locale] || dict.nav.products, href: sectionPath('products', locale) },
    { label: nl.scents[locale] || dict.nav.scents, href: sectionPath('scents', locale) },
    { label: nl.industries[locale] || dict.nav.industries, href: sectionPath('industries', locale) },
    { label: nl.sample[locale] || (locale==='de'?'Duftmuster':locale==='en'?'Fragrance Sample':'Échantillons'), href: sectionPath('sample', locale) },
    { label: nl.production[locale] || dict.nav.production, href: `/${locale}#produktion` },
    { label: nl.faq[locale] || dict.nav.faq, href: `/${locale}#faq` },
  ];
  return (
    <html lang={htmlLang[locale]}>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" />
        <meta name="theme-color" content="#1268E8" />
        {settings.integrations.searchConsole
          && <meta name="google-site-verification" content={settings.integrations.searchConsole} />}
      </head>
      <body>
        <StorefrontProvider>
          <AnnouncementBar text={annText} href={annHref} linkLabel={annLabel} />
          <Header locale={locale} dict={dict} nav={nav} alternates={homeAlternates()} brand={brandName} brandLogo={settings.brand.logo} />
          <main className="pb-mobnav">{children}</main>
          <Footer locale={locale} dict={dict} settings={settings} />
          <MobileNav locale={locale} dict={dict} />
          <QuickContact locale={locale} enabled={settings.quickContact.enabled}
            whatsapp={settings.contact.whatsapp} email={settings.contact.email} phone={settings.contact.phone}
            quoteHref={`/${locale}#angebot`} />
          <CookieBar dict={dict} />
          <Analytics ga4Id={settings.integrations.ga4Enabled ? settings.integrations.ga4Id : ''}
            gtmId={settings.integrations.gtmEnabled ? settings.integrations.gtmId : ''}
            metaPixelId={settings.integrations.metaEnabled ? settings.integrations.metaPixelId : ''}
            analyticsMode={settings.integrations.analyticsMode} />
          {/* §Analytics 3C — route-aware SPA PageView for App Router client navigation. */}
          <RouteAnalytics analyticsMode={settings.integrations.analyticsMode} />
          <Overlays locale={locale} dict={dict} alternates={homeAlternates()} navLabels={nav} />
        </StorefrontProvider>
      </body>
    </html>
  );
}
