import type { Metadata } from 'next';
import { isLocale, type Locale } from '@/i18n/config';
import { getDict } from '@/i18n';
import { getHome } from '@/data/seed/homepage';
import { faq as faqSeed } from '@/data/seed/faq';
import { listCollections, listScents, listIndustries, homeAlternates } from '@/repositories/catalog';
import { buildMetadata, organizationLd, faqLd } from '@/lib/seo';
import JsonLd from '@/seo/JsonLd';
import Hero from '@/components/home/Hero';
import Scents from '@/components/home/Scents';
import QuoteForm from '@/components/home/QuoteForm';
import * as S from '@/components/home/Sections';

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

export async function generateMetadata({ params }: { params:{ locale:string } }): Promise<Metadata> {
  const locale = (isLocale(params.locale)?params.locale:'de') as Locale;
  const title = locale==='de' ? 'Individuelle Werbeduftanhänger ab 1.000 Stück'
    : locale==='en' ? 'Custom Promotional Air Fresheners from 1,000 Units'
    : 'Désodorisants publicitaires personnalisés dès 1 000 pièces';
  return buildMetadata({ locale, path:`/${locale}`, title, description: heroDesc[locale], alternates: homeAlternates() });
}

export default function HomePage({ params }: { params:{ locale:string } }) {
  const locale = (isLocale(params.locale)?params.locale:'de') as Locale;
  const dict = getDict(locale);
  const content = getHome(locale);
  const cols = listCollections(locale);
  const scents = listScents(locale);
  const industries = listIndustries(locale);
  const faqItems = faqSeed.map(f => f.tr[locale]);
  return (
    <>
      <JsonLd data={[organizationLd(), faqLd(faqItems)]} />
      <Hero locale={locale} dict={dict} content={content} />
      <S.TrustMetrics locale={locale} note={content.metricsNote} />
      <S.Collections locale={locale} dict={dict} cols={cols} />
      <S.HowItWorks locale={locale} content={content} />
      <S.ConfiguratorTeaser locale={locale} dict={dict} />
      <S.BrandValue content={content} />
      <S.Industries locale={locale} items={industries} />
      <Scents locale={locale} scents={scents} heading={scentHead[locale]} />
      <S.Production locale={locale} content={content} />
      <S.References locale={locale} />
      <S.WhyBugo locale={locale} content={content} />
      <S.Pricing locale={locale} cols={cols} dict={dict} />
      <QuoteForm locale={locale} />
      <S.Faq locale={locale} items={faqItems} />
      <S.FinalCta locale={locale} dict={dict} content={content} />
    </>
  );
}
