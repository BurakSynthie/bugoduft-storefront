import Link from 'next/link';
import type { Locale } from '@/i18n/config';
import { Container, SectionHeader, Button } from '@/components/ui';
import { IconCheck, IconArrow } from '@/components/ui/icons';
import type { HomeExtra } from '@/data/seed/home-content';
import IndustriesSlider from './IndustriesSlider';

const H = {
  de:{ statsEye:'BUGO in Zahlen', prodEye:'Produktion', prodTitle:'Vom Druck bis zur Verpackung',
       indEye:'Branchen', indTitle:'Für viele Geschäftsbereiche gemacht', galleryEye:'Referenzen', galleryTitle:'Echte Produktionen. Echte Marken.',
       galleryEmpty:'Kundenprojekte erscheinen hier, sobald sie freigegeben sind.',
       logosTitle:'Marken, die auf individuelle Werbewirkung setzen.', logosEmpty:'Logos folgen in Kürze.',
       whyEye:'Warum BUGO', whyTitle:'Ein Partner, der liefert', impactEye:'Markenwirkung',
       revEye:'Bewertungen', revTitle:'Was Kunden sagen', revEmpty:'Bewertungen erscheinen hier, sobald sie vorliegen.',
       faqEye:'FAQ', faqTitle:'Häufige Fragen', supTitle:'Ihre Frage ist nicht dabei?',
       supBody:'Unser Team hilft Ihnen gerne persönlich weiter.', blogEye:'Wissen & Inspiration', blogTitle:'Aktuelles',
       blogEmpty:'Beiträge folgen in Kürze.', blogAll:'Alle Beiträge ansehen', waText:'WhatsApp schreiben', forLabel:'Für' },
  en:{ statsEye:'BUGO in numbers', prodEye:'Production', prodTitle:'From printing to packaging',
       indEye:'Industries', indTitle:'Made for many business areas', galleryEye:'References', galleryTitle:'Real productions. Real brands.',
       galleryEmpty:'Customer projects appear here once approved.',
       logosTitle:'Brands that rely on individual advertising impact.', logosEmpty:'Logos coming soon.',
       whyEye:'Why BUGO', whyTitle:'A partner that delivers', impactEye:'Brand impact',
       revEye:'Reviews', revTitle:'What customers say', revEmpty:'Reviews appear here once available.',
       faqEye:'FAQ', faqTitle:'Frequently asked questions', supTitle:'Your question is not listed?',
       supBody:'Our team is happy to help you personally.', blogEye:'Knowledge & inspiration', blogTitle:'Latest',
       blogEmpty:'Articles coming soon.', blogAll:'View all articles', waText:'Message on WhatsApp', forLabel:'For' },
  fr:{ statsEye:'BUGO en chiffres', prodEye:'Production', prodTitle:'De l’impression à l’emballage',
       indEye:'Secteurs', indTitle:'Conçu pour de nombreux secteurs', galleryEye:'Références', galleryTitle:'Vraies productions. Vraies marques.',
       galleryEmpty:'Les projets clients apparaîtront ici une fois approuvés.',
       logosTitle:'Des marques qui misent sur un impact publicitaire personnalisé.', logosEmpty:'Logos à venir.',
       whyEye:'Pourquoi BUGO', whyTitle:'Un partenaire qui livre', impactEye:'Impact de marque',
       revEye:'Avis', revTitle:'Ce que disent les clients', revEmpty:'Les avis apparaîtront ici une fois disponibles.',
       faqEye:'FAQ', faqTitle:'Questions fréquentes', supTitle:'Votre question n’y figure pas ?',
       supBody:'Notre équipe se fera un plaisir de vous aider.', blogEye:'Savoir & inspiration', blogTitle:'Actualités',
       blogEmpty:'Articles à venir.', blogAll:'Voir tous les articles', waText:'Écrire sur WhatsApp', forLabel:'Pour' },
} as const;

export function TrustStats({ locale, hc }:{ locale:Locale; hc:HomeExtra }) {
  const t = H[locale];
  return (
    <section className="section--tight section">
      <Container>
        <div className="stats">
          {hc.stats.map(s => (
            <div className="stat" key={s.label}><b>{s.value}</b><span>{s.label}</span></div>
          ))}
        </div>
      </Container>
    </section>
  );
}

export function Production4({ locale, hc }:{ locale:Locale; hc:HomeExtra }) {
  const t = H[locale];
  return (
    <section className="section section--subtle" id="produktion">
      <Container>
        <SectionHeader eyebrow={t.prodEye} title={t.prodTitle} />
        <div className="prodwrap">
          {hc.production.map(p => (
            <article className="prodcard" key={p.n}>
              <div className="prodcard__media">
                {p.video
                  ? <video preload="none" muted playsInline controls poster={p.poster ?? undefined}><source src={p.video} /></video>
                  : p.poster ? <img src={p.poster} alt={p.title} loading="lazy" />
                  : <span className="prodcard__ph">{p.n}</span>}
              </div>
              <div className="prodcard__body"><span className="step__n">{p.n}</span><h3>{p.title}</h3><p>{p.body}</p></div>
            </article>
          ))}
        </div>
      </Container>
    </section>
  );
}

export function IndustriesCarousel({ locale, hc }:{ locale:Locale; hc:HomeExtra }) {
  const t = H[locale];
  return (
    <section className="section" id="branchen">
      <Container>
        <SectionHeader eyebrow={t.indEye} title={t.indTitle} />
        <IndustriesSlider items={hc.industries} />
      </Container>
    </section>
  );
}

export function Gallery({ locale, hc }:{ locale:Locale; hc:HomeExtra }) {
  const t = H[locale];
  return (
    <section className="section section--subtle" id="galerie">
      <Container>
        <SectionHeader eyebrow={t.galleryEye} title={t.galleryTitle} />
        {hc.gallery.length ? (
          <div className="hscroll">
            {hc.gallery.map((g,i)=>(
              <figure className={`galcard galcard--${g.orientation}`} key={i}>
                <img src={g.src} alt={g.alt} loading="lazy" /></figure>
            ))}
          </div>
        ) : <div className="emptybox">{t.galleryEmpty}</div>}
      </Container>
    </section>
  );
}

export function LogoRail({ locale, hc }:{ locale:Locale; hc:HomeExtra }) {
  const t = H[locale];
  return (
    <section className="section--tight section">
      <Container>
        <p className="lograil__title">{t.logosTitle}</p>
        {hc.referenceLogos.length ? (
          <div className="lograil"><div className="lograil__track">
            {[...hc.referenceLogos, ...hc.referenceLogos].map((l,i)=>(
              <img key={i} src={l.src} alt={l.alt} loading="lazy" />))}
          </div></div>
        ) : <div className="emptybox emptybox--slim">{t.logosEmpty}</div>}
      </Container>
    </section>
  );
}

export function WhyBugo2({ locale, hc }:{ locale:Locale; hc:HomeExtra }) {
  const t = H[locale];
  return (
    <section className="section" id="warum">
      <Container>
        <SectionHeader eyebrow={t.whyEye} title={t.whyTitle} />
        <div className="grid grid-4">
          {hc.whyBugo.map(u => (
            <div className="card" style={{ padding:'var(--s-5)' }} key={u.title}>
              <h3 style={{ fontSize:'1.02rem' }}>{u.title}</h3>
              <p className="muted" style={{ marginTop:'.4rem', fontSize:'.9rem' }}>{u.body}</p>
            </div>
          ))}
        </div>
      </Container>
    </section>
  );
}

export function BrandImpact({ locale, hc }:{ locale:Locale; hc:HomeExtra }) {
  const t = H[locale]; const b = hc.brandImpact;
  return (
    <section className="section section--subtle">
      <Container>
        <div className="grid grid-2" style={{ alignItems:'center' }}>
          <div>
            <span className="eyebrow">{t.impactEye}</span>
            <h2 className="h2" style={{ marginTop:'var(--s-3)' }}>{b.title}</h2>
            <p className="lede">{b.body}</p>
          </div>
          <ul className="impact">
            {b.points.map(p => <li key={p}><IconCheck size={18} /><span>{p}</span></li>)}
          </ul>
        </div>
      </Container>
    </section>
  );
}

function Stars({ n }:{ n:number }) {
  return <span className="stars" aria-label={`${n}/5`}>{'★★★★★'.slice(0, n)}<span className="stars__off">{'★★★★★'.slice(n)}</span></span>;
}
export function ReviewsPreview({ locale, hc }:{ locale:Locale; hc:HomeExtra }) {
  const t = H[locale];
  return (
    <section className="section" id="bewertungen">
      <Container>
        <SectionHeader eyebrow={t.revEye} title={t.revTitle} />
        {hc.reviews.length ? (
          <div className="grid grid-3">
            {hc.reviews.map((r,i)=>(
              <blockquote className="reviewcard" key={i}>
                <Stars n={r.rating} />
                <p>{r.text}</p>
                <footer><b>{r.name}</b>{r.company?` · ${r.company}`:''}{r.product?<span className="muted"> · {r.product}</span>:null}</footer>
              </blockquote>
            ))}
          </div>
        ) : <div className="emptybox">{t.revEmpty}</div>}
      </Container>
    </section>
  );
}

export function FaqGrouped({ locale, hc }:{ locale:Locale; hc:HomeExtra }) {
  const t = H[locale];
  return (
    <section className="section section--subtle" id="faq">
      <Container><div style={{ maxWidth: 880 }}>
        <SectionHeader eyebrow={t.faqEye} title={t.faqTitle} />
        {hc.faqGroups.map((g,gi)=>(
          <div key={g.group} style={{ marginBottom:'var(--s-6)' }}>
            <div className="faqgroup">{g.group}</div>
            <div className="faq">
              {g.items.map((f,i)=>(
                <details key={i} open={gi===0 && i===0}><summary>{f.q}</summary><p>{f.a}</p></details>
              ))}
            </div>
          </div>
        ))}
      </div></Container>
    </section>
  );
}

export function SupportCta({ locale, hc }:{ locale:Locale; hc:HomeExtra }) {
  const t = H[locale];
  const card = (c: HomeExtra['support']['grafik']) => (
    <div className="supportcard" key={c.title}>
      <h3>{c.title}</h3>
      <p className="muted" style={{ fontSize:'.85rem' }}>{t.forLabel}: {c.forItems.join(' · ')}</p>
      <a className="supportcard__wa" href={`https://wa.me/${c.whatsapp}`} target="_blank" rel="noopener noreferrer">
        <IconCheck size={16} /> {c.display}
      </a>
    </div>
  );
  return (
    <section className="section" id="kontakt">
      <Container>
        <div className="supportcta">
          <div><h2 className="h2">{t.supTitle}</h2><p className="lede">{t.supBody}</p></div>
          <div className="supportgrid">{card(hc.support.grafik)}{card(hc.support.kundenservice)}</div>
        </div>
      </Container>
    </section>
  );
}

export function BlogPreview({ locale, hc }:{ locale:Locale; hc:HomeExtra }) {
  const t = H[locale];
  return (
    <section className="section section--subtle" id="blog">
      <Container>
        <SectionHeader eyebrow={t.blogEye} title={t.blogTitle} />
        {hc.blog.length ? (
          <>
          <div className="grid grid-3">
            {hc.blog.slice(0,3).map((p,i)=>(
              <Link className="card" href={p.href} key={i} style={{ overflow:'hidden' }}>
                <div className="blogcard__media">{p.image ? <img src={p.image} alt={p.title} loading="lazy"/> : null}</div>
                <div style={{ padding:'var(--s-5)' }}>
                  {p.category && <span className="badge">{p.category}</span>}
                  <h3 style={{ fontSize:'1.05rem', marginTop:'.4rem' }}>{p.title}</h3>
                  <p className="muted" style={{ fontSize:'.9rem', marginTop:'.3rem' }}>{p.excerpt}</p>
                </div>
              </Link>
            ))}
          </div>
          <div style={{ marginTop:'var(--s-5)' }}><Button href={`/${locale}#blog`} variant="ghost">{t.blogAll}</Button></div>
          </>
        ) : <div className="emptybox">{t.blogEmpty}</div>}
      </Container>
    </section>
  );
}
