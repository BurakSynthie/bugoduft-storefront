import type { Locale } from '@/i18n/config';
import { Container } from '@/components/ui';
import { HOME_SECTIONS, type HomeSections } from '@/data/seed/home-sections';

// Compact 3-step ordering explainer near the hero. Distinct from the detailed
// "Vom Druck bis zur Verpackung" production section (which stays unchanged).
export default function OrderSteps({ locale, sec }: { locale: Locale; sec?: HomeSections }) {
  const s = sec ?? HOME_SECTIONS[locale];
  const steps: [string, string][] = [['01', s.osStep1], ['02', s.osStep2], ['03', s.osStep3]];
  return (
    <section className="ordersteps" aria-label={s.osEye}>
      <Container>
        <div className="ordersteps__eye">{s.osEye}</div>
        <ol className="ordersteps__row">
          {steps.map(([n, label]) => (
            <li key={n} className="ordersteps__item"><span className="ordersteps__n">{n}</span><span>{label}</span></li>
          ))}
        </ol>
        <p className="ordersteps__note">{s.osNote}</p>
      </Container>
    </section>
  );
}
