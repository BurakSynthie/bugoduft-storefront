import type { Locale } from '@/i18n/config';

// §3 HOMEPAGE CMS — section "chrome": the eyebrows / titles / ledes / notes / empty-states
// that were previously hardcoded inside the home components. Stored INSIDE the existing
// homepage_content JSONB document (HomeExtra.sections) — no new CMS, no schema change.
// The storefront reads chrome(locale, hc.sections): DB override on top of this seed, so a
// never-configured site keeps exactly today's copy, and Admin edits appear after save+reload.
export type HomeSections = {
  // Order steps (compact 3-step strip under the hero)
  osEye: string; osStep1: string; osStep2: string; osStep3: string; osNote: string;
  // Collections
  collectionsEye: string; collectionsTitle: string;
  // How it works
  howEye: string; howTitle: string;
  // Design included
  diEye: string; diTitle: string; diLede: string;
  di1h: string; di1b: string; di2h: string; di2b: string;
  di3h: string; di3b: string; di4h: string; di4b: string;
  // Configurator teaser
  teaserEye: string; teaserTitle: string; teaserLede: string;
  // Production
  prodEye: string; prodTitle: string;
  // Industries
  indEye: string; indTitle: string;
  // Gallery
  galleryEye: string; galleryTitle: string; galleryEmpty: string;
  // Brand impact
  impactEye: string;
  // Why BUGO
  whyEye: string; whyTitle: string;
  // Reviews
  revEye: string; revTitle: string; revEmpty: string;
  // Pricing
  priceEye: string; priceTitle: string; priceNote: string;
  // Large order / quote
  quoteEye: string; quoteTitle: string; quoteLede: string;
  // FAQ
  faqEye: string; faqTitle: string;
  // Support
  supTitle: string; supBody: string; supForLabel: string; supWaText: string;
  // Blog / knowledge
  blogEye: string; blogTitle: string; blogEmpty: string; blogAll: string;
  // References (logo rail)
  logosTitle: string; logosEmpty: string;
  // Final CTA
  ctaTitle: string; ctaBody: string;
};

const de: HomeSections = {
  osEye:'In 3 Schritten zur Bestellung', osStep1:'Produkt wählen', osStep2:'Design & Düfte festlegen', osStep3:'Bestellung abschließen',
  osNote:'Wir prüfen Ihre Daten vor der Produktion persönlich.',
  collectionsEye:'Kollektionen', collectionsTitle:'Vier Kollektionen. Ein Ziel: Ihre Marke.',
  howEye:'So funktioniert’s', howTitle:'In vier Schritten zum eigenen Duftanhänger',
  diEye:'Ihr Design. Unser Service.', diTitle:'Professionelles Grafikdesign inklusive.',
  diLede:'Wir gestalten Ihren Duftanhänger – kostenlos, beidseitig und mit Korrekturen bis zur finalen Freigabe.',
  di1h:'Individuelle Gestaltung', di1b:'Logo, Farben, Texte, QR-Code, Wunschform – nach Ihren Vorgaben.',
  di2h:'Vorder- & Rückseite inklusive', di2b:'Beide Seiten dürfen sich unterscheiden – ohne separate Designgebühr.',
  di3h:'Korrekturen inklusive', di3b:'Wir verfeinern den Entwurf, bis er passt.',
  di4h:'Freigabe vor Produktion', di4b:'Die Produktion startet erst nach Ihrer ausdrücklichen Freigabe.',
  teaserEye:'Konfigurator', teaserTitle:'Konfigurieren Sie in Minuten', teaserLede:'Logo, Duft und Menge – der Rest folgt Schritt für Schritt.',
  prodEye:'Produktion', prodTitle:'Vom Druck bis zur Verpackung',
  indEye:'Branchen', indTitle:'Für viele Geschäftsbereiche gemacht',
  galleryEye:'Referenzen', galleryTitle:'Echte Produktionen. Echte Marken.', galleryEmpty:'Kundenprojekte erscheinen hier, sobald sie freigegeben sind.',
  impactEye:'Markenwirkung',
  whyEye:'Warum BUGO', whyTitle:'Ein Partner, der liefert',
  revEye:'Bewertungen', revTitle:'Was Kunden sagen', revEmpty:'Bewertungen erscheinen hier, sobald sie vorliegen.',
  priceEye:'Preise', priceTitle:'Klare Startpreise pro Kollektion',
  priceNote:'Startpreise pro Bestellung. Der in Ihrer Konfiguration angezeigte Gesamtpreis ist der finale, mit BUGO vereinbarte Betrag – ohne spätere BUGO-Aufpreise.',
  quoteEye:'Großbestellung', quoteTitle:'Angebot für große Auflagen anfragen', quoteLede:'Sagen Sie uns, was Sie brauchen – wir melden uns mit einem individuellen Angebot.',
  faqEye:'FAQ', faqTitle:'Häufige Fragen',
  supTitle:'Ihre Frage ist nicht dabei?', supBody:'Unser Team hilft Ihnen gerne persönlich weiter.', supForLabel:'Für', supWaText:'WhatsApp schreiben',
  blogEye:'Wissen & Inspiration', blogTitle:'Aktuelles', blogEmpty:'Beiträge folgen in Kürze.', blogAll:'Alle Beiträge ansehen',
  logosTitle:'Marken, die auf individuelle Werbewirkung setzen.', logosEmpty:'Logos folgen in Kürze.',
  ctaTitle:'Bereit, Ihre Marke zum Duft zu machen?', ctaBody:'Gestalten Sie Ihren individuellen Duftanhänger oder fordern Sie ein unverbindliches Angebot an.',
};

const en: HomeSections = {
  osEye:'Order in 3 steps', osStep1:'Choose a product', osStep2:'Set design & fragrances', osStep3:'Complete your order',
  osNote:'We personally review your files before production.',
  collectionsEye:'Collections', collectionsTitle:'Four collections. One goal: your brand.',
  howEye:'How it works', howTitle:'Your own air freshener in four steps',
  diEye:'Your design. Our service.', diTitle:'Professional graphic design included.',
  diLede:'We design your air freshener – free, double-sided, with revisions until final approval.',
  di1h:'Custom design', di1b:'Logo, colours, text, QR code, custom shape – to your brief.',
  di2h:'Front & back included', di2b:'Both sides may differ – with no separate design fee.',
  di3h:'Revisions included', di3b:'We refine the proof until it’s right.',
  di4h:'Approval before production', di4b:'Production starts only after your explicit approval.',
  teaserEye:'Configurator', teaserTitle:'Configure in minutes', teaserLede:'Logo, scent and quantity – the rest follows step by step.',
  prodEye:'Production', prodTitle:'From printing to packaging',
  indEye:'Industries', indTitle:'Made for many business areas',
  galleryEye:'References', galleryTitle:'Real productions. Real brands.', galleryEmpty:'Customer projects appear here once approved.',
  impactEye:'Brand impact',
  whyEye:'Why BUGO', whyTitle:'A partner that delivers',
  revEye:'Reviews', revTitle:'What customers say', revEmpty:'Reviews appear here once available.',
  priceEye:'Pricing', priceTitle:'Clear starting prices per collection',
  priceNote:'Starting prices per order. The total shown in your configuration is the final amount agreed with BUGO — no additional BUGO charges later.',
  quoteEye:'Large order', quoteTitle:'Request a quote for high volumes', quoteLede:'Tell us what you need – we’ll get back with a tailored quote.',
  faqEye:'FAQ', faqTitle:'Frequently asked questions',
  supTitle:'Your question is not listed?', supBody:'Our team is happy to help you personally.', supForLabel:'For', supWaText:'Message on WhatsApp',
  blogEye:'Knowledge & inspiration', blogTitle:'Latest', blogEmpty:'Articles coming soon.', blogAll:'View all articles',
  logosTitle:'Brands that rely on individual advertising impact.', logosEmpty:'Logos coming soon.',
  ctaTitle:'Ready to turn your brand into a scent?', ctaBody:'Design your custom air freshener or request a no-obligation quote.',
};

const fr: HomeSections = {
  osEye:'Commander en 3 étapes', osStep1:'Choisir un produit', osStep2:'Définir design & parfums', osStep3:'Finaliser la commande',
  osNote:'Nous vérifions vos fichiers personnellement avant la production.',
  collectionsEye:'Collections', collectionsTitle:'Quatre collections. Un objectif : votre marque.',
  howEye:'Comment ça marche', howTitle:'Votre désodorisant en quatre étapes',
  diEye:'Votre design. Notre service.', diTitle:'Design graphique professionnel inclus.',
  diLede:'Nous concevons votre désodorisant – gratuit, recto-verso, avec corrections jusqu’à la validation finale.',
  di1h:'Design personnalisé', di1b:'Logo, couleurs, textes, QR code, forme sur mesure – selon votre brief.',
  di2h:'Recto & verso inclus', di2b:'Les deux faces peuvent différer – sans frais de design séparés.',
  di3h:'Corrections incluses', di3b:'Nous peaufinons le BAT jusqu’à ce qu’il soit parfait.',
  di4h:'Validation avant production', di4b:'La production ne commence qu’après votre validation explicite.',
  teaserEye:'Configurateur', teaserTitle:'Configurez en quelques minutes', teaserLede:'Logo, parfum et quantité – le reste suit étape par étape.',
  prodEye:'Production', prodTitle:'De l’impression à l’emballage',
  indEye:'Secteurs', indTitle:'Conçu pour de nombreux secteurs',
  galleryEye:'Références', galleryTitle:'Vraies productions. Vraies marques.', galleryEmpty:'Les projets clients apparaîtront ici une fois approuvés.',
  impactEye:'Impact de marque',
  whyEye:'Pourquoi BUGO', whyTitle:'Un partenaire qui livre',
  revEye:'Avis', revTitle:'Ce que disent les clients', revEmpty:'Les avis apparaîtront ici une fois disponibles.',
  priceEye:'Tarifs', priceTitle:'Des prix de départ clairs par collection',
  priceNote:'Prix de départ par commande. Le total affiché dans votre configuration est le montant final convenu avec BUGO — aucun frais BUGO supplémentaire ensuite.',
  quoteEye:'Grande commande', quoteTitle:'Demander un devis pour de grands volumes', quoteLede:'Dites-nous ce qu’il vous faut – nous revenons avec un devis personnalisé.',
  faqEye:'FAQ', faqTitle:'Questions fréquentes',
  supTitle:'Votre question n’y figure pas ?', supBody:'Notre équipe se fera un plaisir de vous aider.', supForLabel:'Pour', supWaText:'Écrire sur WhatsApp',
  blogEye:'Savoir & inspiration', blogTitle:'Actualités', blogEmpty:'Articles à venir.', blogAll:'Voir tous les articles',
  logosTitle:'Des marques qui misent sur un impact publicitaire personnalisé.', logosEmpty:'Logos à venir.',
  ctaTitle:'Prêt à transformer votre marque en parfum ?', ctaBody:'Créez votre désodorisant personnalisé ou demandez un devis sans engagement.',
};

export const HOME_SECTIONS: Record<Locale, HomeSections> = { de, en, fr };

// Storefront: DB override on top of the seed. Missing keys always fall back to seed, so a
// partial admin save can never blank a heading.
export function chrome(locale: Locale, override?: Partial<HomeSections> | null): HomeSections {
  return { ...HOME_SECTIONS[locale], ...(override ?? {}) };
}

// Editor metadata: which fields to render, grouped, and whether multiline. Keeps HomeEditor
// declarative (no 50 hand-written inputs) and guarantees every key is editable.
export type SectionField = { key: keyof HomeSections; label: string; area?: boolean };
export type SectionGroup = { group: string; fields: SectionField[] };
export const SECTION_GROUPS: SectionGroup[] = [
  { group:'Sipariş adımları', fields:[
    { key:'osEye', label:'Üst başlık' }, { key:'osStep1', label:'Adım 1' }, { key:'osStep2', label:'Adım 2' },
    { key:'osStep3', label:'Adım 3' }, { key:'osNote', label:'Alt açıklama / Not', area:true } ] },
  { group:'Koleksiyonlar', fields:[ { key:'collectionsEye', label:'Üst küçük başlık' }, { key:'collectionsTitle', label:'Ana başlık' } ] },
  { group:'Nasıl çalışır', fields:[ { key:'howEye', label:'Üst küçük başlık' }, { key:'howTitle', label:'Ana başlık' } ] },
  { group:'Tasarım dahil', fields:[
    { key:'diEye', label:'Üst küçük başlık' }, { key:'diTitle', label:'Ana başlık' }, { key:'diLede', label:'Kısa açıklama', area:true },
    { key:'di1h', label:'Madde 1 – başlık' }, { key:'di1b', label:'Madde 1 – açıklama', area:true },
    { key:'di2h', label:'Madde 2 – başlık' }, { key:'di2b', label:'Madde 2 – açıklama', area:true },
    { key:'di3h', label:'Madde 3 – başlık' }, { key:'di3b', label:'Madde 3 – açıklama', area:true },
    { key:'di4h', label:'Madde 4 – başlık' }, { key:'di4b', label:'Madde 4 – açıklama', area:true } ] },
  { group:'Konfigüratör teaser', fields:[ { key:'teaserEye', label:'Üst küçük başlık' }, { key:'teaserTitle', label:'Ana başlık' }, { key:'teaserLede', label:'Kısa açıklama', area:true } ] },
  { group:'Üretim', fields:[ { key:'prodEye', label:'Üst küçük başlık' }, { key:'prodTitle', label:'Ana başlık' } ] },
  { group:'Sektörler', fields:[ { key:'indEye', label:'Üst küçük başlık' }, { key:'indTitle', label:'Ana başlık' } ] },
  { group:'Galeri', fields:[ { key:'galleryEye', label:'Üst küçük başlık' }, { key:'galleryTitle', label:'Ana başlık' }, { key:'galleryEmpty', label:'Boş durum mesajı', area:true } ] },
  { group:'Marka etkisi', fields:[ { key:'impactEye', label:'Üst küçük başlık' } ] },
  { group:'Neden BUGO', fields:[ { key:'whyEye', label:'Üst küçük başlık' }, { key:'whyTitle', label:'Ana başlık' } ] },
  { group:'Yorumlar', fields:[ { key:'revEye', label:'Üst küçük başlık' }, { key:'revTitle', label:'Ana başlık' }, { key:'revEmpty', label:'Boş durum mesajı', area:true } ] },
  { group:'Fiyatlar', fields:[ { key:'priceEye', label:'Üst küçük başlık' }, { key:'priceTitle', label:'Ana başlık' }, { key:'priceNote', label:'Alt açıklama / Not', area:true } ] },
  { group:'Teklif / büyük sipariş', fields:[ { key:'quoteEye', label:'Üst küçük başlık' }, { key:'quoteTitle', label:'Ana başlık' }, { key:'quoteLede', label:'Kısa açıklama', area:true } ] },
  { group:'SSS', fields:[ { key:'faqEye', label:'Üst küçük başlık' }, { key:'faqTitle', label:'Ana başlık' } ] },
  { group:'Destek', fields:[ { key:'supTitle', label:'Ana başlık' }, { key:'supBody', label:'Metin', area:true }, { key:'supForLabel', label:'“Için” etiketi' }, { key:'supWaText', label:'WhatsApp etiketi' } ] },
  { group:'Blog', fields:[ { key:'blogEye', label:'Üst küçük başlık' }, { key:'blogTitle', label:'Ana başlık' }, { key:'blogEmpty', label:'Boş durum mesajı', area:true }, { key:'blogAll', label:'“Tümü” bağlantısı' } ] },
  { group:'Referanslar', fields:[ { key:'logosTitle', label:'Ana başlık' }, { key:'logosEmpty', label:'Boş durum mesajı', area:true } ] },
  { group:'Final CTA', fields:[ { key:'ctaTitle', label:'Ana başlık' }, { key:'ctaBody', label:'Metin', area:true } ] },
];
