import Link from 'next/link';
import type { Locale } from '@/i18n/config';
import { Container, Button } from '@/components/ui';
import { IconCheck } from '@/components/ui/icons';
import { configuratorPath } from '@/lib/routing';

// §v1.2.6 Real, indexable Production landing page.
// CONTENT POLICY: only VERIFIED BUGO facts already present elsewhere in this codebase are used
// (front/back artwork, custom outer contour, own logo, graphic-design support, 40 fragrance
// options, production starts after final approval, produced in Germany, from 1,000 units,
// 10–12 working days production / ~15–17 to delivery, Europe-wide shipping). No certifications,
// sustainability, patents, lab or machinery claims are invented. This is code-level landing copy
// (like the existing hero copy); it does NOT introduce a new CMS/DB model, and the homepage
// #produktion section (X.Production4) remains unchanged.

type Step = { t: string; d: string };
type Copy = {
  title: string; description: string;            // SEO title/meta (used by generateMetadata)
  eyebrow: string; h1: string; intro: string;
  stepsHead: string; steps: Step[];
  capsHead: string; caps: string[];
  ctaPrimary: string; ctaSecondary: string;
  homeSectionLabel: string;
};

export const PRODUCTION_COPY: Record<Locale, Copy> = {
  de: {
    title: 'Duftbaum-Produktion – individuelle Werbeduftanhänger',
    description: 'Individuelle Duftbäume aus eigener Produktion in Deutschland – mit Ihrem Logo, individueller Kontur und Wunschduft. Ab 1.000 Stück, europaweiter Versand.',
    eyebrow: 'Produktion',
    h1: 'Produktion individueller Duftbäume',
    intro: 'Von der Druckdatenprüfung bis zum Versand: So entstehen Ihre individuellen Werbeduftanhänger – produziert in Deutschland, ab 1.000 Stück.',
    stepsHead: 'Der Produktionsablauf',
    steps: [
      { t: 'Design & Druckdatenprüfung', d: 'Unser Grafikteam bereitet Ihr Logo und Motiv druckfertig auf und prüft Ihre Druckdaten.' },
      { t: 'Finale Freigabe', d: 'Die Produktion startet erst nach Ihrer finalen Freigabe des Motivs.' },
      { t: 'Druck', d: 'Präziser beidseitiger Druck – Vorder- und Rückseite können unterschiedlich gestaltet sein.' },
      { t: 'Zuschnitt & individuelle Kontur', d: 'Zuschnitt passend zum freigegebenen Design – auch individuelle Außenkonturen sind möglich.' },
      { t: 'Beduftung', d: 'Der gewünschte Duft wird kontrolliert und gleichmäßig aufgebracht – aus 40 Duftoptionen.' },
      { t: 'Verpackung', d: 'Sauber und transportsicher für den Versand vorbereitet.' },
      { t: 'Versand', d: '10–12 Werktage Produktion, ca. 15–17 Werktage bis zur Lieferung – europaweiter Versand.' },
    ],
    capsHead: 'Ihre Gestaltungsmöglichkeiten',
    caps: ['Eigenes Firmenlogo', 'Individuelle Außenkontur', 'Unterschiedliche Vorder- & Rückseite', 'Grafikdesign-Unterstützung', '40 Duftoptionen', 'Produktionsstart nach finaler Freigabe', 'Produziert in Deutschland', 'Ab 1.000 Stück'],
    ctaPrimary: 'Jetzt gestalten',
    ctaSecondary: 'Angebot anfragen',
    homeSectionLabel: 'Produktion auf der Startseite ansehen',
  },
  en: {
    title: 'Custom Air Freshener Production – printed for your brand',
    description: 'Custom car air fresheners produced in Germany – with your logo, custom contour and chosen scent. From 1,000 units, Europe-wide shipping.',
    eyebrow: 'Production',
    h1: 'Production of custom air fresheners',
    intro: 'From print-file check to shipping: how your custom promotional air fresheners are made – produced in Germany, from 1,000 units.',
    stepsHead: 'The production process',
    steps: [
      { t: 'Design & print-file check', d: 'Our graphic team prepares your logo and artwork for print and checks your print files.' },
      { t: 'Final approval', d: 'Production only starts after your final approval of the artwork.' },
      { t: 'Printing', d: 'Precise double-sided printing – front and back can be designed differently.' },
      { t: 'Cutting & custom contour', d: 'Cut to the approved design – custom outer contours are possible.' },
      { t: 'Scenting', d: 'Your chosen scent is applied evenly and under control – from 40 fragrance options.' },
      { t: 'Packaging', d: 'Cleanly prepared and packed securely for transport.' },
      { t: 'Shipping', d: '10–12 working days production, approx. 15–17 working days to delivery – Europe-wide shipping.' },
    ],
    capsHead: 'What you can customise',
    caps: ['Your own company logo', 'Custom outer contour', 'Different front & back artwork', 'Graphic-design support', '40 fragrance options', 'Production starts after final approval', 'Produced in Germany', 'From 1,000 units'],
    ctaPrimary: 'Start designing',
    ctaSecondary: 'Request a quote',
    homeSectionLabel: 'See the production section on the homepage',
  },
  fr: {
    title: 'Fabrication de désodorisants personnalisés',
    description: 'Désodorisants voiture personnalisés fabriqués en Allemagne – avec votre logo, un contour sur mesure et le parfum choisi. Dès 1 000 pièces, livraison en Europe.',
    eyebrow: 'Production',
    h1: 'Fabrication de désodorisants personnalisés',
    intro: 'De la vérification des fichiers à l’expédition : comment sont fabriqués vos désodorisants publicitaires personnalisés – produits en Allemagne, dès 1 000 pièces.',
    stepsHead: 'Le processus de production',
    steps: [
      { t: 'Design & vérification des fichiers', d: 'Notre équipe graphique prépare votre logo et votre visuel pour l’impression et vérifie vos fichiers.' },
      { t: 'Validation finale', d: 'La production ne démarre qu’après la validation finale de votre visuel.' },
      { t: 'Impression', d: 'Impression recto-verso précise – le recto et le verso peuvent être différents.' },
      { t: 'Découpe & contour sur mesure', d: 'Découpe selon le design validé – des contours extérieurs sur mesure sont possibles.' },
      { t: 'Parfumage', d: 'Le parfum choisi est appliqué de façon homogène et contrôlée – parmi 40 options.' },
      { t: 'Conditionnement', d: 'Préparé proprement et emballé pour un transport sécurisé.' },
      { t: 'Expédition', d: '10–12 jours ouvrés de production, env. 15–17 jours jusqu’à la livraison – livraison en Europe.' },
    ],
    capsHead: 'Vos possibilités de personnalisation',
    caps: ['Votre logo d’entreprise', 'Contour extérieur sur mesure', 'Recto et verso différents', 'Accompagnement graphique', '40 options de parfum', 'Production après validation finale', 'Produit en Allemagne', 'Dès 1 000 pièces'],
    ctaPrimary: 'Configurer',
    ctaSecondary: 'Demander un devis',
    homeSectionLabel: 'Voir la section production sur la page d’accueil',
  },
};

// §v1.2.6-final2: optional admin-managed H1/intro overrides (settings.seo.pages.production).
// PRODUCTION_COPY remains the safe fallback when a field is empty/omitted, so the standalone
// homepage #produktion usage (no props) is unchanged.
export default function ProductionLanding({ locale, h1, intro }:
  { locale: Locale; h1?: string | null; intro?: string | null }) {
  const c = PRODUCTION_COPY[locale];
  const heading = h1 || c.h1;
  const lede = intro || c.intro;
  return (
    <section className="section">
      <Container>
        <div style={{ maxWidth: 820 }}>
          <span className="eyebrow">{c.eyebrow}</span>
          <h1 style={{ fontSize: 'var(--t-h2)', marginTop: 'var(--s-3)' }}>{heading}</h1>
          <p className="lede">{lede}</p>
          <div style={{ marginTop: 'var(--s-6)', display: 'flex', gap: 'var(--s-3)', flexWrap: 'wrap' }}>
            <Button href={configuratorPath(locale)} variant="primary" size="lg">{c.ctaPrimary}</Button>
            <Button href={`/${locale}#angebot`} variant="ghost" size="lg">{c.ctaSecondary}</Button>
          </div>
        </div>

        <h2 style={{ fontSize: '1.15rem', margin: 'var(--s-8) 0 var(--s-4)' }}>{c.stepsHead}</h2>
        <div className="grid grid-2">
          {c.steps.map((s, i) => (
            <div className="card" key={i} style={{ padding: 'var(--s-5)' }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: '.6rem' }}>
                <span className="eyebrow" aria-hidden="true">{String(i + 1).padStart(2, '0')}</span>
                <h3 style={{ fontSize: '1.02rem' }}>{s.t}</h3>
              </div>
              <p className="muted" style={{ marginTop: '.4rem' }}>{s.d}</p>
            </div>
          ))}
        </div>

        <h2 style={{ fontSize: '1.15rem', margin: 'var(--s-8) 0 var(--s-4)' }}>{c.capsHead}</h2>
        <ul className="pdp__features" style={{ maxWidth: 820 }}>
          {c.caps.map((f, i) => <li key={i}><IconCheck size={16} /> {f}</li>)}
        </ul>

        <p style={{ marginTop: 'var(--s-6)' }}>
          <Link href={`/${locale}#produktion`} className="muted">{c.homeSectionLabel} →</Link>
        </p>
      </Container>
    </section>
  );
}
