import type { Locale } from '@/i18n/config';
import { Container } from '@/components/ui';
import { WA } from '@/lib/i18n/storefront';
import { business } from '@/config/site';

// Completion pass §7: the FREE pre-order print-file check. A prospective customer who
// already has artwork can send it to BUGO's design team via WhatsApp or email BEFORE
// placing any order, and get an honest human review (resolution / bleed / shape fit) —
// no configurator step, no order required, and explicitly NOT an automated/AI check.
// Contact targets come from the single global Admin -> Ayarlar contact settings
// (contactWhatsapp/contactEmail, threaded down from repositories/settings.ts) with the
// same existing fallback constants already used by the configurator's exit modal
// (lib/i18n/storefront.ts WA.design / config/site.ts business.adminNotificationEmail) —
// no new hardcoded contact is introduced here.
const T: Record<Locale, { eyebrow: string; title: string; body: string; wa: string; email: string }> = {
  de: {
    eyebrow: 'Kostenloser Service',
    title: 'Druckdaten-Vorprüfung — kostenlos, vor der Bestellung',
    body: 'Sie haben bereits ein Druckmotiv? Senden Sie es uns vorab per WhatsApp oder E‑Mail — unser Grafikteam prüft Auflösung, Beschnitt und Passform kostenlos und unverbindlich, bevor Sie bestellen.',
    wa: 'Per WhatsApp senden', email: 'Per E‑Mail senden',
  },
  en: {
    eyebrow: 'Free service',
    title: 'Print-file check — free, before you order',
    body: 'Already have artwork ready? Send it to us in advance via WhatsApp or email — our design team checks resolution, bleed and shape fit for free, with no obligation, before you place an order.',
    wa: 'Send via WhatsApp', email: 'Send via email',
  },
  fr: {
    eyebrow: 'Service gratuit',
    title: 'Vérification des fichiers — gratuite, avant commande',
    body: 'Vous avez déjà un visuel prêt ? Envoyez-le nous au préalable par WhatsApp ou e‑mail — notre équipe graphique vérifie gratuitement et sans engagement la résolution, le fond perdu et l’ajustement à la forme, avant votre commande.',
    wa: 'Envoyer par WhatsApp', email: 'Envoyer par e‑mail',
  },
};

export default function PrintFileCheckCta({ locale, contactEmail, contactWhatsapp }:
  { locale: Locale; contactEmail?: string | null; contactWhatsapp?: string | null }) {
  const t = T[locale];
  const waDigits = (contactWhatsapp ?? '').replace(/\D/g, '');
  const wa = waDigits || WA.design;
  const email = contactEmail || business.adminNotificationEmail;
  return (
    <div className="card filecheck-cta" style={{ padding: 'var(--s-6)', display: 'grid', gap: 'var(--s-3)' }}>
      <span className="eyebrow">{t.eyebrow}</span>
      <h3 style={{ fontSize: '1.05rem', margin: 0 }}>{t.title}</h3>
      <p className="muted" style={{ fontSize: '.9rem', margin: 0 }}>{t.body}</p>
      <div style={{ display: 'flex', gap: 'var(--s-3)', flexWrap: 'wrap', marginTop: 'var(--s-2)' }}>
        <a className="btn btn--ghost" href={`https://wa.me/${wa}`} target="_blank" rel="noopener noreferrer">{t.wa}</a>
        <a className="btn btn--ghost" href={`mailto:${email}`}>{t.email}</a>
      </div>
    </div>
  );
}

export function PrintFileCheckSection({ locale, contactEmail, contactWhatsapp }:
  { locale: Locale; contactEmail?: string | null; contactWhatsapp?: string | null }) {
  return (
    <section className="section" style={{ paddingTop: 0 }}>
      <Container>
        <PrintFileCheckCta locale={locale} contactEmail={contactEmail} contactWhatsapp={contactWhatsapp} />
      </Container>
    </section>
  );
}
