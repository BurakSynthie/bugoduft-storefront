import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Container } from '@/components/ui';
import { isLocale, locales, type Locale } from '@/i18n/config';
import { getInfoPage, INFO_SLUGS } from '@/data/seed/legal';
import { getSettings } from '@/repositories/settings';
import { buildMetadata } from '@/lib/seo';
import type { SeoPageKey } from '@/lib/settings/model';

type Params = { locale: string; slug: string };

export const dynamic = 'force-dynamic';   // legal/company data comes from live settings

export function generateStaticParams() {
  const out: Params[] = [];
  for (const locale of locales) for (const slug of INFO_SLUGS) out.push({ locale, slug });
  return out;
}

// §3 Only About and B2B are managed through the SEO center (indexable info pages).
// Their admin SEO page key matches the info slug.
const SEO_INFO_SLUGS: Record<string, SeoPageKey> = { about: 'about', b2b: 'b2b' };
// Info pages use the same slug across locales → reciprocal hreflang is slug-stable.
function infoAlternates(slug: string): Record<Locale, string> {
  return Object.fromEntries(locales.map(l => [l, `/${l}/info/${slug}`])) as Record<Locale, string>;
}

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const { locale: lp, slug } = await params;        // §HIGH-16 Next.js 15 async params
  if (!isLocale(lp)) return {};
  const locale = lp as Locale;
  const settings = await getSettings();
  const page = getInfoPage(slug, locale, settings.legal);
  if (!page) return {};
  const brand = settings.brandName || undefined;
  const seoKey = SEO_INFO_SLUGS[slug];
  if (seoKey) {
    // §3/§6 About & B2B: brand-aware buildMetadata (auto canonical/hreflang), admin SEO
    // title/description overrides with seed fallback, and OG fallback page → default → static.
    const sp = settings.seo.pages[seoKey];
    return buildMetadata({ locale, path: `/${locale}/info/${slug}`,
      title: sp.title[locale] || page.title,
      description: sp.description[locale] || page.intro || page.title,
      alternates: infoAlternates(slug), brand,
      ogImage: sp.ogImage || settings.defaultOgImage || undefined });
  }
  // Legal pages (Impressum/Datenschutz/AGB/Widerruf/Versand): simple brand-suffixed title.
  return { title: `${page.title} · ${settings.brandName || 'BUGO DUFT'}`, description: page.intro ?? page.title };
}

export default async function InfoPage({ params }: { params: Promise<Params> }) {
  const { locale: lp, slug } = await params;        // §HIGH-16 Next.js 15 async params
  if (!isLocale(lp)) notFound();
  const locale = lp as Locale;
  const settings = await getSettings();
  const page = getInfoPage(slug, locale, settings.legal);
  if (!page) notFound();
  // §3 About/B2B may take an admin H1/intro override where appropriate (no legal-body CMS).
  const seoKey = SEO_INFO_SLUGS[slug];
  const sp = seoKey ? settings.seo.pages[seoKey] : null;
  const h1 = (sp?.h1[locale]) || page.title;
  const intro = (sp?.intro[locale]) || page.intro;
  const warn = { de:'Hinweis: Rechtliche Firmenangaben sind im Admin (Ayarlar → Rechtliche Angaben) noch nicht vollständig hinterlegt.',
    en:'Notice: legal company details are not yet complete in Admin (Ayarlar → Legal).',
    fr:'Remarque : les informations légales de la société ne sont pas encore complètes dans l’admin.' }[locale];
  return (
    <section className="section">
      <Container>
        <div className="pdp__info" style={{ maxWidth:'70ch' }}>
          <h1>{h1}</h1>
          {page.incomplete && (
            <p role="note" style={{ marginTop:'var(--s-3)', padding:'.7rem .9rem', borderRadius:'10px',
              background:'#FEF3F2', color:'#B42318', border:'1px solid #FDA29B', fontSize:'.9rem' }}>{warn}</p>
          )}
          {intro && <p className="muted" style={{ marginTop:'var(--s-3)' }}>{intro}</p>}
          {page.blocks.map((b, i) => (
            <div className="pdp__block" key={i} style={{ marginTop:'var(--s-5)' }}>
              <h2>{b.h}</h2>
              {b.p.split('\n').map((line, j) => <p className="muted" key={j} style={{ marginTop: j ? '.2rem' : '.4rem' }}>{line}</p>)}
            </div>
          ))}
        </div>
      </Container>
    </section>
  );
}
