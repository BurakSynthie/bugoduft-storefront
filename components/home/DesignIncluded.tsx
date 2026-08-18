import type { Locale } from '@/i18n/config';
import { Container, SectionHeader } from '@/components/ui';
import { IconCheck } from '@/components/ui/icons';
import { HOME_SECTIONS, type HomeSections } from '@/data/seed/home-sections';

export default function DesignIncluded({ locale, sec }: { locale: Locale; sec?: HomeSections }) {
  const s = sec ?? HOME_SECTIONS[locale];
  const points: [string, string][] = [[s.di1h, s.di1b], [s.di2h, s.di2b], [s.di3h, s.di3b], [s.di4h, s.di4b]];
  return (
    <section className="section section--subtle" id="design-service">
      <Container>
        <SectionHeader eyebrow={s.diEye} title={s.diTitle} lede={s.diLede} />
        <div className="grid grid-4 designinc">
          {points.map(([h, b], i) => (
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
