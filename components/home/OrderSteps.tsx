import type { Locale } from '@/i18n/config';
import { Container } from '@/components/ui';

// Compact 3-step ordering explainer near the hero. Distinct from the detailed
// "Vom Druck bis zur Verpackung" production section (which stays unchanged).
const COPY: Record<Locale, { eyebrow: string; steps: [string, string][]; note: string }> = {
  de: { eyebrow: 'In 3 Schritten zur Bestellung',
    steps: [['01','Produkt wählen'],['02','Design & Düfte festlegen'],['03','Bestellung abschließen']],
    note: 'Wir prüfen Ihre Daten vor der Produktion persönlich.' },
  en: { eyebrow: 'Order in 3 steps',
    steps: [['01','Choose a product'],['02','Set design & fragrances'],['03','Complete your order']],
    note: 'We personally review your files before production.' },
  fr: { eyebrow: 'Commander en 3 étapes',
    steps: [['01','Choisir un produit'],['02','Définir design & parfums'],['03','Finaliser la commande']],
    note: 'Nous vérifions vos fichiers personnellement avant la production.' },
};

export default function OrderSteps({ locale }: { locale: Locale }) {
  const c = COPY[locale];
  return (
    <section className="ordersteps" aria-label={c.eyebrow}>
      <Container>
        <div className="ordersteps__eye">{c.eyebrow}</div>
        <ol className="ordersteps__row">
          {c.steps.map(([n, label]) => (
            <li key={n} className="ordersteps__item"><span className="ordersteps__n">{n}</span><span>{label}</span></li>
          ))}
        </ol>
        <p className="ordersteps__note">{c.note}</p>
      </Container>
    </section>
  );
}
