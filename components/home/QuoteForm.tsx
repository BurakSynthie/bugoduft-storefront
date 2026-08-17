'use client';
import { useState } from 'react';
import type { Locale } from '@/i18n/config';
import { Container, SectionHeader, Button } from '@/components/ui';
import { submitQuoteAction } from '@/app/actions/quote';

const t = {
  de: { eyebrow:'Großbestellung', title:'Angebot für große Auflagen anfragen',
    lede:'Sagen Sie uns, was Sie brauchen – wir melden uns mit einem individuellen Angebot.',
    company:'Firma', email:'E-Mail', qty:'Menge (Stück)', notes:'Nachricht', send:'Angebot anfragen',
    ok:'Danke! Ihre Anfrage ist bei uns eingegangen – wir melden uns in Kürze.',
    invalid:'Bitte geben Sie eine gültige E-Mail-Adresse und Ihre Anfrage an.',
    err:'Etwas ist schiefgelaufen. Bitte versuchen Sie es erneut.',
    unconf:'Die Anfrage konnte nicht gespeichert werden. Bitte kontaktieren Sie uns direkt.' },
  en: { eyebrow:'Large order', title:'Request a quote for high volumes',
    lede:'Tell us what you need – we’ll get back with a tailored quote.',
    company:'Company', email:'Email', qty:'Quantity (units)', notes:'Message', send:'Request a quote',
    ok:'Thanks! We’ve received your request and will get back to you shortly.',
    invalid:'Please provide a valid email and your request.',
    err:'Something went wrong. Please try again.',
    unconf:'We couldn’t save your request. Please contact us directly.' },
  fr: { eyebrow:'Grande commande', title:'Demander un devis pour de grands volumes',
    lede:'Dites-nous ce qu’il vous faut – nous revenons avec un devis personnalisé.',
    company:'Société', email:'E-mail', qty:'Quantité (pièces)', notes:'Message', send:'Demander un devis',
    ok:'Merci ! Nous avons bien reçu votre demande et reviendrons vers vous rapidement.',
    invalid:'Veuillez indiquer un e-mail valide et votre demande.',
    err:'Une erreur est survenue. Veuillez réessayer.',
    unconf:'Nous n’avons pas pu enregistrer votre demande. Contactez-nous directement.' },
};

export default function QuoteForm({ locale }: { locale: Locale }) {
  const c = t[locale];
  const [company, setCompany] = useState('');
  const [email, setEmail] = useState('');
  const [quantity, setQuantity] = useState('');
  const [message, setMessage] = useState('');
  const [hp, setHp] = useState('');
  const [state, setState] = useState<'idle'|'sending'|'ok'|'invalid'|'err'|'unconf'>('idle');

  async function onSubmit() {
    setState('sending');
    const res = await submitQuoteAction({ locale, company, email, quantity, message, hp });
    if (res.ok) { setState('ok'); setCompany(''); setEmail(''); setQuantity(''); setMessage(''); }
    else setState(res.code === 'invalid' ? 'invalid' : res.code === 'unconfigured' ? 'unconf' : 'err');
  }
  const note = state==='ok'?c.ok : state==='invalid'?c.invalid : state==='unconf'?c.unconf : state==='err'?c.err : '';

  return (
    <section className="section section--subtle" id="angebot">
      <Container>
        <div className="quote2">
          <div><SectionHeader eyebrow={c.eyebrow} title={c.title} lede={c.lede} /></div>
          <div className="quote2__form">
            <div className="field"><label htmlFor="q-co">{c.company}</label><input id="q-co" className="input" value={company} onChange={e=>setCompany(e.target.value)} /></div>
            <div className="grid grid-2">
              <div className="field"><label htmlFor="q-em">{c.email}</label><input id="q-em" type="email" className="input" value={email} onChange={e=>setEmail(e.target.value)} /></div>
              <div className="field"><label htmlFor="q-qty">{c.qty}</label><input id="q-qty" inputMode="numeric" className="input" placeholder="10000" value={quantity} onChange={e=>setQuantity(e.target.value)} /></div>
            </div>
            <div className="field"><label htmlFor="q-msg">{c.notes}</label><textarea id="q-msg" className="textarea" rows={4} value={message} onChange={e=>setMessage(e.target.value)} /></div>
            {/* honeypot (hidden from users) */}
            <input tabIndex={-1} autoComplete="off" value={hp} onChange={e=>setHp(e.target.value)}
              style={{ position:'absolute', left:'-9999px', width:1, height:1, opacity:0 }} aria-hidden="true" />
            <Button onClick={state==="sending"?undefined:onSubmit} variant="primary" size="lg">{state==="sending"?"…":c.send}</Button>
            {note && <p className="muted" style={{ marginTop:'var(--s-3)', fontSize:'.82rem', color: state==='ok'?'#1a7f37':undefined }} role="status">{note}</p>}
          </div>
        </div>
      </Container>
    </section>
  );
}
