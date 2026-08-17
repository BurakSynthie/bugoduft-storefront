import type { Locale } from '@/i18n/config';
import { Container, SectionHeader } from '@/components/ui';
import { IconCheck } from '@/components/ui/icons';

// "Ihr Design. Unser Service." — compact, premium, CMS-extensible later. Communicates
// the core promise incl. production-only-after-approval. No fake photography.
const COPY: Record<Locale, { eyebrow: string; title: string; lede: string; points: [string, string][] }> = {
  de: { eyebrow:'Ihr Design. Unser Service.', title:'Professionelles Grafikdesign inklusive.',
    lede:'Wir gestalten Ihren Duftanhänger – kostenlos, beidseitig und mit Korrekturen bis zur finalen Freigabe.',
    points:[['Individuelle Gestaltung','Logo, Farben, Texte, QR-Code, Wunschform – nach Ihren Vorgaben.'],
      ['Vorder- & Rückseite inklusive','Beide Seiten dürfen sich unterscheiden – ohne separate Designgebühr.'],
      ['Korrekturen inklusive','Wir verfeinern den Entwurf, bis er passt.'],
      ['Freigabe vor Produktion','Die Produktion startet erst nach Ihrer ausdrücklichen Freigabe.']] },
  en: { eyebrow:'Your design. Our service.', title:'Professional graphic design included.',
    lede:'We design your air freshener – free, double-sided, with revisions until final approval.',
    points:[['Custom design','Logo, colours, text, QR code, custom shape – to your brief.'],
      ['Front & back included','Both sides may differ – with no separate design fee.'],
      ['Revisions included','We refine the proof until it’s right.'],
      ['Approval before production','Production starts only after your explicit approval.']] },
  fr: { eyebrow:'Votre design. Notre service.', title:'Design graphique professionnel inclus.',
    lede:'Nous concevons votre désodorisant – gratuit, recto-verso, avec corrections jusqu’à la validation finale.',
    points:[['Design personnalisé','Logo, couleurs, textes, QR code, forme sur mesure – selon votre brief.'],
      ['Recto & verso inclus','Les deux faces peuvent différer – sans frais de design séparés.'],
      ['Corrections incluses','Nous peaufinons le BAT jusqu’à ce qu’il soit parfait.'],
      ['Validation avant production','La production ne commence qu’après votre validation explicite.']] },
};

export default function DesignIncluded({ locale }: { locale: Locale }) {
  const c = COPY[locale];
  return (
    <section className="section section--subtle" id="design-service">
      <Container>
        <SectionHeader eyebrow={c.eyebrow} title={c.title} lede={c.lede} />
        <div className="grid grid-4 designinc">
          {c.points.map(([h, b], i) => (
            <div className="designinc__card" key={i}>
              <span className="designinc__n"><IconCheck size={16} /></span>
              <h3>{h}</h3><p className="muted">{b}</p>
            </div>
          ))}
        </div>
      </Container>
    </section>
  );
}
