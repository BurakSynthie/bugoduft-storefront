'use client';
import { useState } from 'react';
import type { Locale } from '@/i18n/config';
import { Container, SectionHeader, Button } from '@/components/ui';

const t = {
  de: { eyebrow:'Großbestellung', title:'Angebot für große Auflagen anfragen',
    lede:'Sagen Sie uns, was Sie brauchen – wir melden uns mit einem individuellen Angebot.',
    company:'Firma', email:'E-Mail', qty:'Menge (Stück)', notes:'Nachricht', send:'Angebot anfragen',
    note:'Der E-Mail-Versand ist noch nicht konfiguriert – Ihre Anfrage wird noch nicht versendet.' },
  en: { eyebrow:'Large order', title:'Request a quote for high volumes',
    lede:'Tell us what you need – we’ll get back with a tailored quote.',
    company:'Company', email:'Email', qty:'Quantity (units)', notes:'Message', send:'Request a quote',
    note:'Email sending is not configured yet – your request is not sent yet.' },
  fr: { eyebrow:'Grande commande', title:'Demander un devis pour de grands volumes',
    lede:'Dites-nous ce qu’il vous faut – nous revenons avec un devis personnalisé.',
    company:'Société', email:'E-mail', qty:'Quantité (pièces)', notes:'Message', send:'Demander un devis',
    note:'L’envoi d’e-mails n’est pas encore configuré – votre demande n’est pas encore envoyée.' },
};
export default function QuoteForm({ locale }: { locale: Locale }) {
  const c = t[locale];
  const [done, setDone] = useState(false);
  return (
    <section className="section section--subtle" id="angebot">
      <Container>
        <div className="quote2">
          <div><SectionHeader eyebrow={c.eyebrow} title={c.title} lede={c.lede} /></div>
          <div className="quote2__form">
            <div className="field"><label htmlFor="q-co">{c.company}</label><input id="q-co" className="input" /></div>
            <div className="grid grid-2">
              <div className="field"><label htmlFor="q-em">{c.email}</label><input id="q-em" type="email" className="input" /></div>
              <div className="field"><label htmlFor="q-qty">{c.qty}</label><input id="q-qty" inputMode="numeric" className="input" placeholder="10000" /></div>
            </div>
            <div className="field"><label htmlFor="q-msg">{c.notes}</label><textarea id="q-msg" className="textarea" rows={4} /></div>
            <Button onClick={() => setDone(true)} variant="primary" size="lg">{c.send}</Button>
            <p className="muted" style={{ marginTop:'var(--s-3)', fontSize:'.82rem' }} role="status">
              {done ? c.note : c.note}
            </p>
          </div>
        </div>
      </Container>
    </section>
  );
}
