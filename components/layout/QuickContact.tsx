'use client';
import { useState } from 'react';
import type { Locale } from '@/i18n/config';

// §4–7 Floating quick-contact. BUGO-blue / white / dark — NOT the generic green WhatsApp
// tab. Desktop: slim right-edge tab that opens a small panel. Mobile: compact round FAB
// above the bottom nav (safe-area aware) opening the same actions. All destinations come
// from the existing Admin → Ayarlar contact settings; empty destinations are not rendered.
// Renders nothing when disabled or when no action is available.

type Labels = { contact: string; whatsapp: string; email: string; service: string; quote: string; close: string; waPrefill: string; mailSubject: string };
const L: Record<Locale, Labels> = {
  de: { contact:'Kontakt', whatsapp:'WhatsApp', email:'E-Mail', service:'Kundenservice', quote:'Angebot anfragen', close:'Schließen',
        waPrefill:'Hallo BUGO, ich habe eine Frage zu individuellen Duftanhängern.', mailSubject:'Anfrage – BUGO DUFT' },
  en: { contact:'Contact', whatsapp:'WhatsApp', email:'Email', service:'Customer Service', quote:'Request a Quote', close:'Close',
        waPrefill:'Hello BUGO, I have a question about custom air fresheners.', mailSubject:'Enquiry – BUGO DUFT' },
  fr: { contact:'Contact', whatsapp:'WhatsApp', email:'E-mail', service:'Service client', quote:'Demander un devis', close:'Fermer',
        waPrefill:'Bonjour BUGO, j’ai une question sur les désodorisants personnalisés.', mailSubject:'Demande – BUGO DUFT' },
};

function Ico({ d }: { d: string }) {
  return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={d} /></svg>;
}
const ICON = {
  chat: 'M21 11.5a8.38 8.38 0 0 1-8.5 8.4 8.5 8.5 0 0 1-3.9-.9L3 21l1.9-5.1a8.38 8.38 0 0 1-.9-3.9A8.5 8.5 0 0 1 12.5 3 8.38 8.38 0 0 1 21 11.5z',
  mail: 'M4 4h16v16H4zM4 6l8 6 8-6',
  phone:'M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2 4.2 2 2 0 0 1 4 2h3a2 2 0 0 1 2 1.7c.1.9.4 1.8.7 2.6a2 2 0 0 1-.5 2.1L8.1 9.9a16 16 0 0 0 6 6l1.5-1.1a2 2 0 0 1 2.1-.5c.8.3 1.7.6 2.6.7a2 2 0 0 1 1.7 2z',
  spark:'M12 3l1.9 4.6L18.5 9l-4.6 1.9L12 15l-1.9-4.1L5.5 9l4.6-1.4z',
  x:    'M18 6L6 18M6 6l12 12',
};

export default function QuickContact({ locale, enabled, whatsapp, email, phone, quoteHref }:
  { locale: Locale; enabled: boolean; whatsapp: string; email: string; phone: string; quoteHref: string }) {
  const [open, setOpen] = useState(false);
  if (!enabled) return null;

  const t = L[locale];
  const waDigits = (whatsapp || '').replace(/[^\d]/g, '');
  type Action = { key: string; label: string; href: string; icon: string; external?: boolean };
  const actions: Action[] = [];
  if (waDigits) actions.push({ key:'wa', label:t.whatsapp, icon:ICON.chat, external:true,
    href:`https://wa.me/${waDigits}?text=${encodeURIComponent(t.waPrefill)}` });
  if (email) actions.push({ key:'mail', label:t.email, icon:ICON.mail,
    href:`mailto:${email}?subject=${encodeURIComponent(t.mailSubject)}` });
  // Customer service priority: WhatsApp → phone → email.
  const serviceHref = waDigits ? `https://wa.me/${waDigits}`
    : phone ? `tel:${phone.replace(/\s+/g, '')}` : email ? `mailto:${email}` : '';
  if (serviceHref) actions.push({ key:'svc', label:t.service, icon:ICON.phone, href:serviceHref, external: serviceHref.startsWith('http') });
  // Request a quote always available (on-page section anchor).
  actions.push({ key:'quote', label:t.quote, icon:ICON.spark, href:quoteHref });

  if (!actions.length) return null;

  return (
    <div className={`qc${open ? ' qc--open' : ''}`}>
      {open && <button className="qc__scrim" aria-label={t.close} onClick={()=>setOpen(false)} />}
      {open && (
        <div className="qc__panel" role="dialog" aria-label={t.contact}>
          <div className="qc__head"><span>{t.contact}</span>
            <button className="qc__close" aria-label={t.close} onClick={()=>setOpen(false)}><Ico d={ICON.x} /></button>
          </div>
          <div className="qc__actions">
            {actions.map(a => (
              <a key={a.key} className="qc__action" href={a.href}
                 {...(a.external ? { target:'_blank', rel:'noopener noreferrer' } : {})}
                 onClick={()=>setOpen(false)}>
                <span className="qc__ico"><Ico d={a.icon} /></span>{a.label}
              </a>
            ))}
          </div>
        </div>
      )}
      <button className="qc__toggle" aria-expanded={open} aria-label={t.contact} onClick={()=>setOpen(o=>!o)}>
        <span className="qc__toggleico"><Ico d={open ? ICON.x : ICON.chat} /></span>
        <span className="qc__togglelabel">{t.contact}</span>
      </button>
    </div>
  );
}
