import ProdVideo from './ProdVideo';
import Link from 'next/link';
import type { Locale } from '@/i18n/config';
import { Container, SectionHeader, Button } from '@/components/ui';
import { IconCheck, IconArrow } from '@/components/ui/icons';
import type { HomeExtra } from '@/data/seed/home-content';
import { chrome } from '@/data/seed/home-sections';
import IndustriesSlider from './IndustriesSlider';

// Section chrome now comes from the homepage CMS (hc.sections) with seed fallback.


export function TrustStats({ locale, hc }:{ locale:Locale; hc:HomeExtra }) {
  const t = chrome(locale, hc.sections);
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
  const t = chrome(locale, hc.sections);
  return (
    <section className="section section--subtle" id="produktion">
      <Container>
        <SectionHeader eyebrow={t.prodEye} title={t.prodTitle} />
        <div className="prodwrap">
          {hc.production.map(p => (
            <article className="prodcard" key={p.n}>
              <div className="prodcard__media">
                {p.video
                  ? <ProdVideo src={p.video} poster={p.poster} label={p.title} />
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
  const t = chrome(locale, hc.sections);
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
  if (!hc.gallery.length) return null;   // §26 hide when empty (no large empty block)
  const t = chrome(locale, hc.sections);
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
  if (!hc.referenceLogos.length) return null;   // §26 hide when empty
  const t = chrome(locale, hc.sections);
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
  const t = chrome(locale, hc.sections);
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
  const t = chrome(locale, hc.sections); const b = hc.brandImpact;
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
  if (!hc.reviews.length) return null;   // §26 hide when empty
  const t = chrome(locale, hc.sections);
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
  const t = chrome(locale, hc.sections);
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

type RoleContact = { email?: string; whatsapp?: string; phone?: string };
export function SupportCta({ locale, hc, grafik, service }:
  { locale:Locale; hc:HomeExtra; grafik?: RoleContact; service?: RoleContact }) {
  const t = chrome(locale, hc.sections);
  // §9 ROLE-SPECIFIC contacts. Each support card wires to its OWN email, WhatsApp destination
  // and display phone from Admin → Ayarlar (Grafik & Design vs Kundenservice), falling back to
  // the per-role seed value — the two roles are NEVER merged onto one shared destination. The
  // CMS still controls the card titles, "for" items and labels (business copy).
  const card = (c: HomeExtra['support']['grafik'], rc: RoleContact | undefined) => {
    const waDigits = (rc?.whatsapp || c.whatsapp || '').replace(/\D/g, '');
    const email = (rc?.email || '').trim();
    const phone = (rc?.phone || c.display || '').trim();
    return (
      <div className="supportcard" key={c.title}>
        <h3>{c.title}</h3>
        <p className="muted" style={{ fontSize:'.85rem' }}>{t.supForLabel}: {c.forItems.join(' · ')}</p>
        {waDigits && (
          <a className="supportcard__wa" href={`https://wa.me/${waDigits}`} target="_blank" rel="noopener noreferrer">
            <IconCheck size={16} /> {t.supWaText}
          </a>
        )}
        {(email || phone) && (
          <p className="supportcard__meta muted" style={{ fontSize:'.82rem', marginTop:'.5rem' }}>
            {email && <a href={`mailto:${email}`}>{email}</a>}
            {email && phone && <span aria-hidden="true"> · </span>}
            {phone && <a href={`tel:${phone.replace(/[^\d+]/g, '')}`}>{phone}</a>}
          </p>
        )}
      </div>
    );
  };
  return (
    <section className="section" id="kontakt">
      <Container>
        <div className="supportcta">
          <div><h2 className="h2">{t.supTitle}</h2><p className="lede">{t.supBody}</p></div>
          <div className="supportgrid">{card(hc.support.grafik, grafik)}{card(hc.support.kundenservice, service)}</div>
        </div>
      </Container>
    </section>
  );
}

// §13 Homepage Blog preview — wired to the real published Blog repository. `posts` are the
// latest published articles for the current locale (server-fetched in app/[locale]/page.tsx).
// When there are no published posts the section stays HIDDEN (preserves prior behavior; no
// fake/demo content). "View all" links to the real /[locale]/blog index.
export type BlogPreviewItem = { href: string; title: string; excerpt: string; image: string | null; category?: string };
export function BlogPreview({ locale, hc, posts }:{ locale:Locale; hc:HomeExtra; posts: BlogPreviewItem[] }) {
  if (!posts.length) return null;     // §13 hide when empty
  const t = chrome(locale, hc.sections);
  return (
    <section className="section section--subtle" id="blog">
      <Container>
        <SectionHeader eyebrow={t.blogEye} title={t.blogTitle} />
        <div className="grid grid-3">
          {posts.slice(0,3).map((p,i)=>(
            <Link className="card" href={p.href} key={i} style={{ overflow:'hidden' }}>
              <div className="blogcard__media">{p.image ? <img src={p.image} alt={p.title} loading="lazy"/> : null}</div>
              <div style={{ padding:'var(--s-5)' }}>
                {p.category && <span className="badge">{p.category}</span>}
                <h3 style={{ fontSize:'1.05rem', marginTop:'.4rem' }}>{p.title}</h3>
                {p.excerpt && <p className="muted" style={{ fontSize:'.9rem', marginTop:'.3rem' }}>{p.excerpt}</p>}
              </div>
            </Link>
          ))}
        </div>
        <div style={{ marginTop:'var(--s-5)' }}><Button href={`/${locale}/blog`} variant="ghost">{t.blogAll}</Button></div>
      </Container>
    </section>
  );
}
