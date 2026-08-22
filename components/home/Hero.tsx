import type { Locale } from '@/i18n/config';
import { configuratorPath, sectionPath } from '@/lib/routing';
import type { Dict } from '@/i18n';
import type { HomeContent } from '@/data/seed/homepage';
import type { HomeExtra } from '@/data/seed/home-content';
import { Container, Button } from '@/components/ui';
import { IconCheck } from '@/components/ui/icons';
import ProdVideo from '@/components/home/ProdVideo';

const COPY = {
  de:{ head:'Individuelle Duftanhänger für Ihre Marke.',
       sub:'Professionell produziert, individuell gestaltet und europaweit geliefert.',
       secondary:'Produkte entdecken', finalPrice:'Ihr angezeigter Preis ist der finale BUGO-Preis.' },
  en:{ head:'Custom air fresheners for your brand.',
       sub:'Professionally produced, individually designed and delivered Europe-wide.',
       secondary:'Explore products', finalPrice:'The price shown is your final BUGO price.' },
  fr:{ head:'Désodorisants personnalisés pour votre marque.',
       sub:'Production professionnelle, design sur mesure, livraison en Europe.',
       secondary:'Découvrir les produits', finalPrice:'Le prix affiché est votre prix BUGO final.' },
} as const;

export default function Hero({ locale, dict, content, hc }:
  { locale: Locale; dict: Dict; content: HomeContent; hc: HomeExtra }) {
  const c = COPY[locale];
  return (
    <section className="hero section">
      <Container>
        {/* §v1.2.6 C — CSS Grid areas (intro / media / details). A SINGLE hero media instance is
            repositioned by CSS, never duplicated (no separate mobile/desktop video copy).
            DESKTOP: intro top-left, details bottom-left, media right (row-gap:0 so the split keeps
            the original stacked spacing → desktop is visually unchanged).
            MOBILE: intro → media → details, so the customer reads what BUGO sells, immediately
            SEES the product video, then reaches the CTAs. The semantic <h1> is preserved. */}
        <div className={`hero__grid${hc.heroVideo ? ' hero__grid--media' : ''}`}>
          <div className="hero__intro">
            <span className="eyebrow">{hc.heroEyebrow || content.hero.eyebrow}</span>
            <h1 style={{ marginTop:'var(--s-4)' }}>{hc.heroHead || c.head}</h1>
            <p className="hero__sub">{hc.heroSub || c.sub}</p>
          </div>
          {/* Real product visual slot: video (CMS-managed) → image → CSS fallback.
              Subtle float, reduced-motion safe. */}
          <div className={`hero__visual hero__area-media${hc.heroVideo ? ' hero__visual--media' : ''}`} aria-hidden={(hc.heroProductImage || hc.heroVideo) ? undefined : true}>
            {hc.heroVideo
              ? <HeroMedia video={hc.heroVideo} poster={hc.heroPoster ?? null} />
              : hc.heroProductImage
              ? <img className="hero__product" src={hc.heroProductImage} alt="BUGO DUFT Duftanhänger" width={520} height={650} />
              : <span className="hero__stage" aria-hidden="true"><span className="hero__cord" /><span className="hero__silhouette" /></span>}
          </div>
          <div className="hero__details">
            <span className="hero__ship"><IconCheck size={14} /> {hc.shippingIncluded}</span>
            <span className="hero__ship"><IconCheck size={14} /> {c.finalPrice}</span>
            <div className="hero__cta">
              <Button href={configuratorPath(locale)} variant="primary" size="lg">{dict.cta.configure}</Button>
              <Button href={sectionPath('products', locale)} variant="ghost" size="lg">{c.secondary}</Button>
            </div>
            <div className="hero__points">
              {hc.heroChips.map(p => <span key={p}><IconCheck size={16} />{p}</span>)}
            </div>
            <div className="hero__cred">
              {hc.credibility.map(cr => <span key={cr} className="hero__credchip">{cr}</span>)}
            </div>
          </div>
        </div>
      </Container>
    </section>
  );
}

// Hero video: reuses the decorative auto-loop/muted/no-controls player, wrapped for
// responsive aspect on mobile (no giant fixed-height box).
function HeroMedia({ video, poster }: { video: string; poster: string | null }) {
  return <span className="hero__media"><ProdVideo src={video} poster={poster} label="BUGO DUFT" /></span>;
}
