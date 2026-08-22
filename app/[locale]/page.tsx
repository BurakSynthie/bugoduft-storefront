import type { Metadata } from 'next';
import { isLocale, type Locale } from '@/i18n/config';
import { getDict } from '@/i18n';
import { getHome } from '@/data/seed/homepage';
import { getHomeExtra } from '@/repositories/homepage';
import { getSettings } from '@/repositories/settings';
import { listPublishedPosts } from '@/repositories/blog';
import { blogArticlePath } from '@/lib/blog/types';
import OrderSteps from '@/components/home/OrderSteps';
import DesignIncluded from '@/components/home/DesignIncluded';
import { listCollections, listScents, listIndustries, homeAlternates } from '@/repositories/catalog';
import { getScents as getScentsRead } from '@/repositories/catalog.read';
import { getCollections } from '@/repositories/catalog.read';
import { buildMetadata, organizationLd, faqLd } from '@/lib/seo';
import JsonLd from '@/seo/JsonLd';
import Hero from '@/components/home/Hero';
import Scents from '@/components/home/Scents';
import QuoteForm from '@/components/home/QuoteForm';
import * as S from '@/components/home/Sections';
import * as X from '@/components/home/HomeExtras';
import { chrome } from '@/data/seed/home-sections';

const heroDesc: Record<Locale,string> = {
  de:'Individuell gestaltete Werbeduftanhänger mit Ihrem Logo und Wunschduft. Ab 1.000 Stück, produziert in Deutschland.',
  en:'Custom-designed promotional air fresheners with your logo and scent. From 1,000 units, produced in Germany.',
  fr:'Désodorisants publicitaires personnalisés avec votre logo et votre parfum. Dès 1 000 pièces, produits en Allemagne.',
};
const scentHead: Record<Locale,{eyebrow:string;title:string;lede:string}> = {
  de:{ eyebrow:'Düfte', title:'Finden Sie Ihren Markenduft', lede:'Von frisch bis intensiv – wählen Sie den Duft, der zu Ihrer Marke passt.' },
  en:{ eyebrow:'Scents', title:'Find your brand scent', lede:'From fresh to intense – choose the scent that fits your brand.' },
  fr:{ eyebrow:'Parfums', title:'Trouvez votre parfum de marque', lede:'Du frais à l’intense – choisissez le parfum qui correspond à votre marque.' },
};

export async function generateMetadata({ params }: { params: Promise<{ locale:string }> }): Promise<Metadata> {
  const { locale: lp } = await params;              // §HIGH-16 Next.js 15 async params
  const locale = (isLocale(lp)?lp:'de') as Locale;
  const seedTitle = locale==='de' ? 'Individuelle Werbeduftanhänger ab 1.000 Stück'
    : locale==='en' ? 'Custom Promotional Air Fresheners from 1,000 Units'
    : 'Désodorisants publicitaires personnalisés dès 1 000 pièces';
  // Completion pass §13: DB-first homepage SEO (Admin -> Ayarlar), seed fallback when
  // never configured. Canonical/hreflang stay auto-derived (buildMetadata), never
  // admin-editable. Product-page SEO (app/[locale]/[...slug]/page.tsx) is unaffected.
  const settings = await getSettings();
  const brand = settings.brandName || undefined;
  // §H home SEO: page-level admin overrides (seo.pages.home) win, then legacy seo.home, then
  // the shipped seed title/description. §I buildMetadata strips any legacy brand suffix so the
  // central template adds the brand exactly once.
  const page = settings.seo.pages.home;
  const title = page.title[locale] || settings.seo.home.title[locale] || seedTitle;
  const description = page.description[locale] || settings.seo.home.description[locale] || heroDesc[locale];
  return buildMetadata({ locale, path:`/${locale}`, title, description, alternates: homeAlternates(),
    ogImage: page.ogImage || settings.defaultOgImage || undefined, brand });
}

export default async function HomePage({ params }: { params: Promise<{ locale:string }> }) {
  const { locale: lp } = await params;              // §HIGH-16 Next.js 15 async params
  const locale = (isLocale(lp)?lp:'de') as Locale;
  const dict = getDict(locale);
  const content = getHome(locale);
  const cols = await getCollections(locale);
  const scents = await getScentsRead(locale);
  const industries = listIndustries(locale);
  const hc = await getHomeExtra(locale);
  const sec = chrome(locale, hc.sections);
  const settings = await getSettings();
  const sections = settings.sections;
  const faqItems = hc.faqGroups.flatMap(g => g.items);
  // §13 Homepage Blog preview reads the real published Blog CMS (latest 3 for this locale).
  const blogPreview = (await listPublishedPosts(locale, 3)).map(p => ({
    href: blogArticlePath(locale, p.slug), title: p.title, excerpt: p.excerpt,
    image: p.coverImage, category: p.category || undefined,
  }));
  return (
    <>
      <JsonLd data={[organizationLd({
        brand: settings.brandName || undefined,
        email: settings.contact.service.email || settings.contact.email || null,
        logo: settings.brand.logo || null,
      }), faqLd(faqItems)]} />
      <Hero locale={locale} dict={dict} content={content} hc={hc} />
      <OrderSteps locale={locale} sec={sec} />
      <X.TrustStats locale={locale} hc={hc} />
      <S.Collections locale={locale} dict={dict} cols={cols} sec={sec} />
      <S.HowItWorks locale={locale} content={content} sec={sec} />
      <DesignIncluded locale={locale} sec={sec} />
      <S.ConfiguratorTeaser locale={locale} dict={dict} sec={sec} />
      <X.Production4 locale={locale} hc={hc} />
      <X.IndustriesCarousel locale={locale} hc={hc} />
      {sections.gallery && <X.Gallery locale={locale} hc={hc} />}
      <Scents locale={locale} scents={scents} heading={hc.scentsHeading
        ? { eyebrow: hc.scentsHeading.eyebrow || scentHead[locale].eyebrow,
            title: hc.scentsHeading.title || scentHead[locale].title,
            lede: hc.scentsHeading.description || scentHead[locale].lede }
        : scentHead[locale]} />
      <X.BrandImpact locale={locale} hc={hc} />
      <X.WhyBugo2 locale={locale} hc={hc} />
      <X.ReviewsPreview locale={locale} hc={hc} />
      <S.Pricing locale={locale} cols={cols} dict={dict} sec={sec} />
      <QuoteForm locale={locale} sec={sec} />
      {sections.faq && <X.FaqGrouped locale={locale} hc={hc} />}
      <X.SupportCta locale={locale} hc={hc}
        grafik={{ email: settings.contact.graphic.email, whatsapp: settings.contact.graphic.whatsapp, phone: settings.contact.graphic.phone }}
        service={{ email: settings.contact.service.email, whatsapp: settings.contact.service.whatsapp, phone: settings.contact.service.phone }} />
      <X.BlogPreview locale={locale} hc={hc} posts={blogPreview} />
      {sections.references && <X.LogoRail locale={locale} hc={hc} />}
      <S.FinalCta locale={locale} dict={dict} content={content} sec={sec} />
    </>
  );
}
