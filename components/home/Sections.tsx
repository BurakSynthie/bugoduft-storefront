import Link from 'next/link';
import { configuratorPath } from '@/lib/routing';
import type { Locale } from '@/i18n/config';
import type { Dict } from '@/i18n';
import type { HomeContent } from '@/data/seed/homepage';
import { Container, SectionHeader, Button, Price, Badge } from '@/components/ui';
import Reveal from '@/components/ui/Reveal';
import { IconArrow } from '@/components/ui/icons';
import { itemPath } from '@/lib/routing';

type Col = { code:string; name:string; description:string; priceFromCents:number|null; productSlug:string|null; coverImage?:string|null };

const DETAILS: Record<Locale,string> = { de:'Details ansehen', en:'View details', fr:'Voir les détails' };

const L = {
  de: { collectionsEye:'Kollektionen', collectionsTitle:'Vier Kollektionen. Ein Ziel: Ihre Marke.',
        howEye:'So funktioniert’s', howTitle:'In vier Schritten zum eigenen Duftanhänger',
        teaserEye:'Konfigurator', teaserTitle:'Konfigurieren Sie in Minuten', teaserLede:'Logo, Duft und Menge – der Rest folgt Schritt für Schritt.',
        prodEye:'Produktion', prodTitle:'Vom Auftrag bis zum Versand',
        whyEye:'Warum BUGO', whyTitle:'Spezialist statt Baukasten',
        priceEye:'Preise', priceTitle:'Klare Startpreise pro Kollektion',
        priceNote:'Preise verstehen sich als Startpreise pro Bestellung. Endgültige Preis-, Versand- und Steuerangaben sind im Checkout ausgewiesen.',
        refEye:'Referenzen', refTitle:'Ausgewählte Projekte',
        refEmpty:'Referenzen werden gepflegt und erscheinen hier, sobald sie freigegeben sind.',
        metricsTitle:'Kennzahlen', faqEye:'FAQ', faqTitle:'Häufige Fragen',
        indEye:'Branchen', indTitle:'Für Ihre Branche gemacht' },
  en: { collectionsEye:'Collections', collectionsTitle:'Four collections. One goal: your brand.',
        howEye:'How it works', howTitle:'Your own air freshener in four steps',
        teaserEye:'Configurator', teaserTitle:'Configure in minutes', teaserLede:'Logo, scent and quantity – the rest follows step by step.',
        prodEye:'Production', prodTitle:'From order to shipping',
        whyEye:'Why BUGO', whyTitle:'A specialist, not a toolkit',
        priceEye:'Pricing', priceTitle:'Clear starting prices per collection',
        priceNote:'Prices are starting prices per order. Final price, shipping and tax details are shown at checkout.',
        refEye:'References', refTitle:'Selected projects',
        refEmpty:'References are curated and appear here once approved.',
        metricsTitle:'Metrics', faqEye:'FAQ', faqTitle:'Frequently asked questions',
        indEye:'Industries', indTitle:'Made for your industry' },
  fr: { collectionsEye:'Collections', collectionsTitle:'Quatre collections. Un objectif : votre marque.',
        howEye:'Comment ça marche', howTitle:'Votre désodorisant en quatre étapes',
        teaserEye:'Configurateur', teaserTitle:'Configurez en quelques minutes', teaserLede:'Logo, parfum et quantité – le reste suit étape par étape.',
        prodEye:'Production', prodTitle:'De la commande à l’expédition',
        whyEye:'Pourquoi BUGO', whyTitle:'Un spécialiste, pas un kit',
        priceEye:'Tarifs', priceTitle:'Des prix de départ clairs par collection',
        priceNote:'Les prix sont des prix de départ par commande. Prix final, livraison et taxes sont indiqués au paiement.',
        refEye:'Références', refTitle:'Projets sélectionnés',
        refEmpty:'Les références sont sélectionnées et apparaissent ici une fois approuvées.',
        metricsTitle:'Indicateurs', faqEye:'FAQ', faqTitle:'Questions fréquentes',
        indEye:'Secteurs', indTitle:'Conçu pour votre secteur' },
};

export function Collections({ locale, dict, cols }: { locale:Locale; dict:Dict; cols:Col[] }) {
  const x = L[locale];
  return (
    <section className="section section--subtle" id="kollektionen">
      <Container>
        <SectionHeader eyebrow={x.collectionsEye} title={x.collectionsTitle} />
        <div className="grid grid-4">
          {cols.map(c => (
            <Reveal key={c.code}>
              <article className="card ccard">
                <div className="ccard__media" data-c={c.code}>
                  {c.coverImage && <img src={c.coverImage} alt={c.name} className="ccard__cover" loading="lazy" />}
                </div>
                <div className="ccard__body">
                  <div className="ccard__row">
                    <h3>{c.name}</h3>
                    {c.code === 'VIP' && <Badge accent>Top</Badge>}
                  </div>
                  <p className="muted" style={{ margin:'.4rem 0 var(--s-4)', fontSize:'.9rem' }}>{c.description}</p>
                  <div className="ccard__row">
                    {c.priceFromCents != null &&
                      <Price cents={c.priceFromCents} currency="EUR" locale={locale} from={dict.common.from} label={dict.common.perOrder} />}
                    {c.productSlug &&
                      <Link href={itemPath('products', locale, c.productSlug)} className="ccard__details">
                        {DETAILS[locale]} <IconArrow size={15} />
                      </Link>}
                  </div>
                </div>
              </article>
            </Reveal>
          ))}
        </div>
      </Container>
    </section>
  );
}

export function HowItWorks({ locale, content }: { locale:Locale; content:HomeContent }) {
  const x = L[locale];
  return (
    <section className="section" id="ablauf">
      <Container>
        <SectionHeader eyebrow={x.howEye} title={x.howTitle} />
        <div className="steps steps--4">
          {content.howItWorks.map(s => (
            <div className="step" key={s.n}>
              <span className="step__n">{s.n}</span><h3>{s.title}</h3><p>{s.body}</p>
            </div>
          ))}
        </div>
      </Container>
    </section>
  );
}

export function ConfiguratorTeaser({ locale, dict }: { locale:Locale; dict:Dict }) {
  const x = L[locale];
  return (
    <section className="section section--subtle" id="konfigurator">
      <Container>
        <div className="card" style={{ padding:'var(--s-8)', display:'grid', gap:'var(--s-5)' }}>
          <div><span className="eyebrow">{x.teaserEye}</span>
            <h2 className="h2" style={{ marginTop:'var(--s-3)' }}>{x.teaserTitle}</h2>
            <p className="lede">{x.teaserLede}</p></div>
          <div className="grid grid-3">
            {['1 · Logo', '2 · ' + dict.nav.scents, '3 · ' + (locale==='de'?'Menge':locale==='en'?'Quantity':'Quantité')].map(s => (
              <div key={s} style={{ border:'1px dashed var(--border)', borderRadius:'var(--r-card)', padding:'var(--s-5)', color:'var(--fg-muted)' }}>{s}</div>
            ))}
          </div>
          <div><Button href={configuratorPath(locale)} variant="primary" size="lg">{dict.cta.configureFull}</Button></div>
        </div>
      </Container>
    </section>
  );
}

export function BrandValue({ content }: { content:HomeContent }) {
  const b = content.brandValue;
  return (
    <section className="section">
      <Container><div style={{ maxWidth: 780 }}>
        <span className="eyebrow">{b.eyebrow}</span>
        <h2 className="h2" style={{ marginTop:'var(--s-3)', maxWidth:'20ch' }}>{b.title}</h2>
        <p className="lede">{b.body}</p>
      </div></Container>
    </section>
  );
}

export function Production({ locale, content }: { locale:Locale; content:HomeContent }) {
  const x = L[locale];
  return (
    <section className="section section--subtle" id="produktion">
      <Container>
        <SectionHeader eyebrow={x.prodEye} title={x.prodTitle} />
        <div className="timeline">
          {content.production.map(t => (
            <div className="tl" key={t.title}><span className="tl__dot" /><div><b>{t.title}</b><br /><span>{t.note}</span></div></div>
          ))}
        </div>
      </Container>
    </section>
  );
}

export function WhyBugo({ locale, content }: { locale:Locale; content:HomeContent }) {
  const x = L[locale];
  return (
    <section className="section" id="warum">
      <Container>
        <SectionHeader eyebrow={x.whyEye} title={x.whyTitle} />
        <div className="grid grid-4">
          {content.whyBugo.map(u => (
            <div key={u.title} className="card" style={{ padding:'var(--s-5)' }}>
              <h3 style={{ fontSize:'1.05rem' }}>{u.title}</h3>
              <p className="muted" style={{ marginTop:'.4rem', fontSize:'.92rem' }}>{u.body}</p>
            </div>
          ))}
        </div>
      </Container>
    </section>
  );
}

export function Industries({ locale, items }: { locale:Locale; items:{name:string;slug:string;headline:string;body:string}[] }) {
  const x = L[locale];
  return (
    <section className="section section--subtle" id="branchen">
      <Container>
        <SectionHeader eyebrow={x.indEye} title={x.indTitle} />
        <div className="grid grid-2">
          {items.map(i => (
            <Link key={i.slug} href={itemPath('industries', locale, i.slug)} className="card" style={{ padding:'var(--s-6)' }}>
              <h3 style={{ fontSize:'1.15rem' }}>{i.headline}</h3>
              <p className="muted" style={{ marginTop:'.5rem' }}>{i.body}</p>
            </Link>
          ))}
        </div>
      </Container>
    </section>
  );
}

export function Pricing({ locale, cols, dict }: { locale:Locale; cols:Col[]; dict:Dict }) {
  const x = L[locale];
  return (
    <section className="section" id="preise">
      <Container>
        <SectionHeader eyebrow={x.priceEye} title={x.priceTitle} />
        <div className="grid grid-4">
          {cols.map(c => (
            <div key={c.code} className="card" style={{ padding:'var(--s-5)' }}>
              <h3 style={{ fontSize:'1.05rem' }}>{c.name}</h3>
              {c.priceFromCents != null &&
                <div style={{ marginTop:'var(--s-3)' }}>
                  <Price cents={c.priceFromCents} currency="EUR" locale={locale} from={dict.common.from} label={dict.common.perOrder} />
                </div>}
            </div>
          ))}
        </div>
        <p className="muted" style={{ marginTop:'var(--s-5)', fontSize:'.85rem', maxWidth:'72ch' }}>{x.priceNote}</p>
      </Container>
    </section>
  );
}

// Honest states — no fabricated numbers, no invented brands.
export function TrustMetrics({ locale, note }: { locale:Locale; note:string }) {
  const x = L[locale];
  return (
    <section className="section--tight section">
      <Container>
        <div style={{ display:'flex', gap:'var(--s-4)', flexWrap:'wrap', alignItems:'center',
          border:'1px dashed var(--border)', borderRadius:'var(--r-card)', padding:'var(--s-5)' }}>
          <strong>{x.metricsTitle}</strong>
          <span className="muted" style={{ fontSize:'.9rem' }}>{note}</span>
        </div>
      </Container>
    </section>
  );
}
export function References({ locale }: { locale:Locale }) {
  const x = L[locale];
  return (
    <section className="section" id="referenzen">
      <Container>
        <SectionHeader eyebrow={x.refEye} title={x.refTitle} />
        <div style={{ border:'1px dashed var(--border)', borderRadius:'var(--r-card)', padding:'var(--s-8)', textAlign:'center' }}>
          <p className="muted">{x.refEmpty}</p>
        </div>
      </Container>
    </section>
  );
}
export function Faq({ locale, items }: { locale:Locale; items:{q:string;a:string}[] }) {
  const x = L[locale];
  return (
    <section className="section section--subtle" id="faq">
      <Container><div style={{ maxWidth: 820 }}>
        <SectionHeader eyebrow={x.faqEye} title={x.faqTitle} />
        <div className="faq">
          {items.map((f,i) => (
            <details key={i} open={i===0}><summary>{f.q}</summary><p>{f.a}</p></details>
          ))}
        </div>
      </div></Container>
    </section>
  );
}
export function FinalCta({ locale, dict, content }: { locale:Locale; dict:Dict; content:HomeContent }) {
  const f = content.finalCta;
  return (
    <section className="section section--dark" id="cta">
      <Container><div style={{ maxWidth: 720 }}>
        <h2 className="h2" style={{ color:'#fff' }}>{f.title}</h2>
        <p className="lede" style={{ marginBottom:'var(--s-6)' }}>{f.body}</p>
        <div style={{ display:'flex', gap:'var(--s-3)', flexWrap:'wrap' }}>
          <Button href={configuratorPath(locale)} variant="on-dark" size="lg">{dict.cta.configure}</Button>
          <Button href={`/${locale}#angebot`} variant="ghost" size="lg">{dict.cta.quote}</Button>
        </div>
      </div></Container>
    </section>
  );
}
