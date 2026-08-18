'use client';
import { useState } from 'react';
import type { Locale } from '@/i18n/config';
import { Container, SectionHeader, Button } from '@/components/ui';
import { formatMoney } from '@/lib/money';
import { beginSampleCheckoutAction } from '@/app/actions/sample-checkout';
import PrintFileCheckCta from './PrintFileCheckCta';

// Completion pass §1: compact, standalone purchase flow for the Duftmuster-Set. No
// configurator, no 1,000+ main-product order required — this is intentionally its own
// minimal page rather than a new checkout system (reuses beginSampleCheckoutAction ->
// the same Draft Order architecture as the main checkout).
const T: Record<Locale, {
  eyebrow: string; title: string; lede: string; price: string; bullet1: string; bullet2: string;
  bullet3: string; cta: string; loading: string; error: string; creditNote: string;
}> = {
  de: { eyebrow:'Duftmuster', title:'Duftmuster-Set — 40 Düfte', lede:'Testen Sie unser gesamtes Duftsortiment, bevor Sie sich entscheiden.',
    price:'Einmaliger Preis', bullet1:'Alle 40 BUGO-Düfte in einem Set', bullet2:'Kein Mindestbestellwert nötig',
    bullet3:'Ideal zur Entscheidungsfindung vor einer größeren Bestellung', cta:'Für {price} bestellen',
    loading:'Wird vorbereitet …', error:'Der Checkout konnte nicht vorbereitet werden. Bitte versuchen Sie es erneut.',
    creditNote:'Bestellen Sie später ab 1.000 Stück, erhalten Sie {credit} Guthaben auf diese Bestellung angerechnet.' },
  en: { eyebrow:'Fragrance sample', title:'Fragrance Sample Set — 40 scents', lede:'Try our entire fragrance range before you decide.',
    price:'One-time price', bullet1:'All 40 BUGO fragrances in one set', bullet2:'No minimum order required',
    bullet3:'Ideal for deciding before a larger order', cta:'Order for {price}',
    loading:'Preparing …', error:'Checkout could not be prepared. Please try again.',
    creditNote:'Order 1,000+ units later and get {credit} credited toward that order.' },
  fr: { eyebrow:'Échantillons', title:'Coffret d’échantillons — 40 parfums', lede:'Testez toute notre gamme de parfums avant de vous décider.',
    price:'Prix unique', bullet1:'Les 40 parfums BUGO en un seul coffret', bullet2:'Aucune commande minimum requise',
    bullet3:'Idéal pour décider avant une commande plus importante', cta:'Commander pour {price}',
    loading:'Préparation …', error:'Le paiement n’a pas pu être préparé. Veuillez réessayer.',
    creditNote:'Commandez ensuite 1 000 pièces ou plus et {credit} seront déduits de cette commande.' },
};

export default function SamplePage({ locale, contactEmail, contactWhatsapp, priceCents, creditCents }:
  { locale: Locale; contactEmail?: string | null; contactWhatsapp?: string | null; priceCents: number; creditCents: number }) {
  const t = T[locale];
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // §P1: price/credit are server-provided from admin settings — no compile-time constants.
  const price = formatMoney(priceCents, 'EUR', locale);
  const credit = formatMoney(creditCents, 'EUR', locale);

  async function onBuy() {
    if (loading) return;
    setLoading(true); setError(null);
    try {
      const res = await beginSampleCheckoutAction(locale);
      if (res.ok) { window.location.href = res.checkoutUrl; return; }
      // Server error strings are only ever written in German — never surface them to an
      // en/fr customer; the localized t.error covers those locales.
      setError(locale === 'de' ? (res.message || t.error) : t.error);
    } catch { setError(t.error); }
    setLoading(false);
  }

  return (
    <section className="section">
      <Container>
        <SectionHeader eyebrow={t.eyebrow} title={t.title} lede={t.lede} />
        <div className="card" style={{ padding:'var(--s-8)', maxWidth: 560, display:'grid', gap:'var(--s-5)' }}>
          <ul style={{ display:'grid', gap:'.5rem', paddingLeft:'1.1rem' }}>
            <li>{t.bullet1}</li>
            <li>{t.bullet2}</li>
            <li>{t.bullet3}</li>
          </ul>
          <div className="price" style={{ fontSize:'1.4rem' }}>
            <small style={{ display:'block', fontSize:'.75rem', fontWeight:400 }}>{t.price}</small>
            {price}
          </div>
          <p className="muted" style={{ fontSize:'.85rem' }}>{t.creditNote.replace('{credit}', credit)}</p>
          <Button onClick={onBuy} variant="primary" size="lg" block ariaLabel={t.cta.replace('{price}', price)}>
            {loading ? t.loading : t.cta.replace('{price}', price)}
          </Button>
          {error && <p className="cfg-error" role="alert">{error}</p>}
        </div>
        <div style={{ maxWidth: 560, marginTop: 'var(--s-6)' }}>
          <PrintFileCheckCta locale={locale} contactEmail={contactEmail} contactWhatsapp={contactWhatsapp} />
        </div>
      </Container>
    </section>
  );
}
