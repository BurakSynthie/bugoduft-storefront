import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Container } from '@/components/ui';
import { isLocale, locales, type Locale } from '@/i18n/config';
import { getInfoPage, INFO_SLUGS } from '@/data/seed/legal';
import { getSettings } from '@/repositories/settings';

type Params = { locale: string; slug: string };

export const dynamic = 'force-dynamic';   // legal/company data comes from live settings

export function generateStaticParams() {
  const out: Params[] = [];
  for (const locale of locales) for (const slug of INFO_SLUGS) out.push({ locale, slug });
  return out;
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  if (!isLocale(params.locale)) return {};
  const settings = await getSettings();
  const page = getInfoPage(params.slug, params.locale as Locale, settings.legal);
  if (!page) return {};
  return { title: `${page.title} · BUGO DUFT`, description: page.intro ?? page.title };
}

export default async function InfoPage({ params }: { params: Params }) {
  if (!isLocale(params.locale)) notFound();
  const locale = params.locale as Locale;
  const settings = await getSettings();
  const page = getInfoPage(params.slug, locale, settings.legal);
  if (!page) notFound();
  const warn = { de:'Hinweis: Rechtliche Firmenangaben sind im Admin (Ayarlar → Rechtliche Angaben) noch nicht vollständig hinterlegt.',
    en:'Notice: legal company details are not yet complete in Admin (Ayarlar → Legal).',
    fr:'Remarque : les informations légales de la société ne sont pas encore complètes dans l’admin.' }[locale];
  return (
    <section className="section">
      <Container>
        <div className="pdp__info" style={{ maxWidth:'70ch' }}>
          <h1>{page.title}</h1>
          {page.incomplete && (
            <p role="note" style={{ marginTop:'var(--s-3)', padding:'.7rem .9rem', borderRadius:'10px',
              background:'#FEF3F2', color:'#B42318', border:'1px solid #FDA29B', fontSize:'.9rem' }}>{warn}</p>
          )}
          {page.intro && <p className="muted" style={{ marginTop:'var(--s-3)' }}>{page.intro}</p>}
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
