import type { Locale } from '@/i18n/config';
import { configuratorPath } from '@/lib/routing';
import type { Dict } from '@/i18n';
import type { HomeContent } from '@/data/seed/homepage';
import { Container, Button } from '@/components/ui';
import { IconCheck } from '@/components/ui/icons';

export default function Hero({ locale, dict, content }:
  { locale: Locale; dict: Dict; content: HomeContent }) {
  const h = content.hero;
  const points = locale === 'de'
    ? ['Ab 1.000 Stück', 'Produktion in Deutschland', 'Designfreigabe inklusive']
    : locale === 'en'
    ? ['From 1,000 units', 'Produced in Germany', 'Design approval included']
    : ['Dès 1 000 pièces', 'Produit en Allemagne', 'Validation du design incluse'];
  return (
    <section className="hero section">
      <Container>
        <div className="hero__grid">
          <div>
            <span className="eyebrow">{h.eyebrow}</span>
            <h1 style={{ marginTop:'var(--s-4)' }}>
              {h.line1}<br />{h.line2}<br /><span className="accent">{h.line3}</span>
            </h1>
            <p className="hero__sub">{h.sub}</p>
            <div className="hero__cta">
              <Button href={configuratorPath(locale)} variant="primary" size="lg">{dict.cta.configure}</Button>
              <Button href={`/${locale}#angebot`} variant="ghost" size="lg">{dict.cta.quote}</Button>
            </div>
            <div className="hero__points">
              {points.map(p => <span key={p}><IconCheck size={16} />{p}</span>)}
            </div>
          </div>
          {/* LCP visual: rendered with CSS (no external asset to lazy-load wrongly).
              In production this becomes a priority <Image> with explicit dimensions. */}
          <div className="hero__visual" aria-hidden="true">
            <div className="hero__tag"><small>Your logo</small><b>BUGO</b></div>
          </div>
        </div>
      </Container>
    </section>
  );
}
