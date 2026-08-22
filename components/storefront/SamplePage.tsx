'use client';
import { useState } from 'react';
import type { Locale } from '@/i18n/config';
import { Container, SectionHeader, Button } from '@/components/ui';
import { formatMoney } from '@/lib/money';
import { beginSampleCheckoutAction } from '@/app/actions/sample-checkout';
import { getSampleAttemptId, rotateSampleAttemptId } from '@/lib/checkout/sample-attempt';
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

export default function SamplePage({ locale, contactEmail, contactWhatsapp, priceCents, creditCents, identity, h1, intro }:
  { locale: Locale; contactEmail?: string | null; contactWhatsapp?: string | null; priceCents: number; creditCents: number; identity?: string | null; h1?: string | null; intro?: string | null }) {
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
      // §OPTION-3-v3 #6C a STABLE idempotency key that survives retry AND page reload / remount /
      // lost-response-then-reload, scoped to the current identity so a different signed-in user on
      // the same browser cannot inherit this attempt. Cleared only on authoritative success.
      const key = getSampleAttemptId(identity ?? 'guest');
      const res = await beginSampleCheckoutAction(locale, key);
      // §OPTION-3-v4 #8 do NOT clear the attempt key before/at handoff. If navigation to Shopify
      // fails or the tab crashes and the customer reloads BUGO, the SAME key must still resume the
      // SAME payable draft (idempotent), not mint a second one. The key is rotated only when a
      // genuinely new purchase is started after the prior attempt is authoritatively completed —
      // which for this flow means the customer paid (a NEW sample page visit issues a new key via
      // the server-side identity scoping) — so we keep the key here and just navigate.
      if (res.ok) { window.location.href = res.checkoutUrl; return; }
      // §OPTION-3-v4 #5 the prior attempt reached a TERMINAL payment state (paid/cancelled): the old
      // key is no longer resumable. Rotate to a fresh key for a deliberate NEW purchase and retry
      // ONCE with it. (Only ROTATE triggers a retry; other failures surface to the customer.)
      if (res.code === 'rotate') {
        const fresh = rotateSampleAttemptId(identity ?? 'guest');
        const retry = await beginSampleCheckoutAction(locale, fresh);
        if (retry.ok) { window.location.href = retry.checkoutUrl; return; }
        setError(locale === 'de' ? ((retry as any).message || t.error) : t.error);
        setLoading(false);
        return;
      }
      // Server error strings are only ever written in German — never surface them to an
      // en/fr customer; the localized t.error covers those locales.
      setError(locale === 'de' ? (res.message || t.error) : t.error);
    } catch { setError(t.error); }
    setLoading(false);
  }

  return (
    <section className="section">
      <Container>
        <SectionHeader eyebrow={t.eyebrow} title={h1 || t.title} lede={intro || t.lede} />
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
