import type { Locale } from '@/i18n/config';
import type { SiteSettings } from '@/lib/settings/model';

// §3 Legal/info content. Company-specific Impressum/Datenschutz data comes from
// Admin → Ayarlar (settings.legal) — NEVER hardcoded and NEVER shown as a placeholder.
// If required company data is missing, the page is flagged incomplete (route shows an admin
// warning) instead of printing a fake value. Uses § 5 DDG (current wording, not TMG).
export type InfoBlock = { h: string; p: string };
export type InfoPage = { title: string; intro?: string; blocks: InfoBlock[]; incomplete?: boolean };
export type LegalInfo = SiteSettings['legal'];

export const INFO_SLUGS = ['impressum','datenschutz','agb','widerruf','versand','about','b2b'] as const;
export type InfoSlug = typeof INFO_SLUGS[number];

const missingLabel: Record<Locale, string> = {
  de: '(im Admin zu ergänzen)', en: '(to be completed in admin)', fr: '(à compléter dans l’admin)',
};

function companyBlock(l: LegalInfo, locale: Locale): { text: string; incomplete: boolean } {
  const need = (v: string) => (v && v.trim() ? v.trim() : missingLabel[locale]);
  const incomplete = !(l.companyName && l.representative && l.address);
  const labels = {
    de: { name:'Firma', rep:'Inhaber/Vertretungsberechtigt', addr:'Anschrift', vat:'USt-IdNr.', mail:'E-Mail' },
    en: { name:'Company', rep:'Owner/Authorised representative', addr:'Address', vat:'VAT ID', mail:'Email' },
    fr: { name:'Société', rep:'Propriétaire/Représentant autorisé', addr:'Adresse', vat:'N° de TVA', mail:'E-mail' },
  }[locale];
  const lines = [
    `${labels.name}: ${need(l.companyName)}`,
    `${labels.rep}: ${need(l.representative)}`,
    `${labels.addr}: ${need(l.address)}`,
  ];
  if (l.vatId?.trim()) lines.push(`${labels.vat}: ${l.vatId.trim()}`);
  if (l.email?.trim()) lines.push(`${labels.mail}: ${l.email.trim()}`);
  return { text: lines.join('\n'), incomplete };
}

export function getInfoPage(slug: string, locale: Locale, legal: LegalInfo): InfoPage | null {
  if (!(INFO_SLUGS as readonly string[]).includes(slug)) return null;

  if (slug === 'impressum') {
    const cb = companyBlock(legal, locale);
    const head: Record<Locale, string> = { de:'Angaben gemäß § 5 DDG', en:'Information pursuant to § 5 DDG', fr:'Informations selon § 5 DDG' };
    const t: Record<Locale, InfoPage> = {
      de: { title:'Impressum', incomplete: cb.incomplete, blocks:[
        { h: head.de, p: cb.text },
        { h:'Kontakt', p:'Die aktuellen Kontaktdaten finden Sie im Footer und im Kontaktbereich der Website.' },
        { h:'Haftung für Inhalte', p:'Als Diensteanbieter sind wir für eigene Inhalte auf diesen Seiten verantwortlich. Für die Richtigkeit, Vollständigkeit und Aktualität übernehmen wir jedoch keine Gewähr.' } ] },
      en: { title:'Legal Notice', incomplete: cb.incomplete, blocks:[
        { h: head.en, p: cb.text },
        { h:'Contact', p:'Current contact details are available in the footer and the contact area of the website.' },
        { h:'Liability for content', p:'As a service provider we are responsible for our own content, but assume no guarantee for its accuracy, completeness or timeliness.' } ] },
      fr: { title:'Mentions légales', incomplete: cb.incomplete, blocks:[
        { h: head.fr, p: cb.text },
        { h:'Contact', p:'Les coordonnées actuelles figurent dans le pied de page et la zone de contact du site.' },
        { h:'Responsabilité du contenu', p:'En tant que prestataire, nous sommes responsables de nos propres contenus, sans garantie d’exactitude, d’exhaustivité ou d’actualité.' } ] },
    };
    return t[locale];
  }

  if (slug === 'datenschutz') {
    const controller = (legal.companyName?.trim() || missingLabel[locale]);
    const incomplete = !legal.companyName?.trim();
    const t: Record<Locale, InfoPage> = {
      de: { title:'Datenschutzerklärung', intro:'Der Schutz Ihrer personenbezogenen Daten ist uns wichtig.', incomplete, blocks:[
        { h:'Verantwortlicher', p:`Verantwortlich für die Datenverarbeitung ist ${controller}.` },
        { h:'Erhebung und Verarbeitung', p:'Wir verarbeiten personenbezogene Daten ausschließlich im Rahmen der gesetzlichen Vorgaben (DSGVO), z. B. zur Vertragsabwicklung, Kontaktaufnahme und Angebotserstellung.' },
        { h:'Cookies & Tracking', p:'Analyse- und Marketing-Dienste werden nur nach Ihrer Einwilligung geladen. Sie können Ihre Einwilligung jederzeit über „Cookie-Einstellungen“ im Footer anpassen.' },
        { h:'Ihre Rechte', p:'Sie haben das Recht auf Auskunft, Berichtigung, Löschung, Einschränkung und Widerspruch. Wenden Sie sich hierzu an die im Impressum genannten Kontaktdaten.' } ] },
      en: { title:'Privacy Policy', intro:'Protecting your personal data is important to us.', incomplete, blocks:[
        { h:'Controller', p:`The controller for data processing is ${controller}.` },
        { h:'Collection and processing', p:'We process personal data only within the legal framework (GDPR), e.g. for order fulfilment, contact and quotes.' },
        { h:'Cookies & tracking', p:'Analytics and marketing services load only after your consent. You can adjust your consent at any time via “Cookie settings” in the footer.' },
        { h:'Your rights', p:'You have the right to access, rectification, erasure, restriction and objection. Please use the contact details in the legal notice.' } ] },
      fr: { title:'Politique de confidentialité', intro:'La protection de vos données personnelles nous tient à cœur.', incomplete, blocks:[
        { h:'Responsable', p:`Le responsable du traitement est ${controller}.` },
        { h:'Collecte et traitement', p:'Nous traitons les données personnelles uniquement dans le cadre légal (RGPD), par ex. pour l’exécution des commandes, le contact et les devis.' },
        { h:'Cookies & suivi', p:'Les services d’analyse et de marketing ne se chargent qu’après votre consentement, modifiable à tout moment via « Paramètres des cookies » dans le pied de page.' },
        { h:'Vos droits', p:'Vous disposez d’un droit d’accès, de rectification, d’effacement, de limitation et d’opposition. Utilisez les coordonnées des mentions légales.' } ] },
    };
    return t[locale];
  }

  const staticPages: Record<Exclude<InfoSlug,'impressum'|'datenschutz'>, Record<Locale, InfoPage>> = {
    agb: {
      de: { title:'Allgemeine Geschäftsbedingungen', blocks:[
        { h:'Geltungsbereich', p:'Diese AGB gelten für alle Bestellungen individuell bedruckter Duftanhänger über diese Website im B2B-Kontext.' },
        { h:'Angebot und Vertragsschluss', p:'Konfigurationen und Angebotsanfragen sind unverbindlich. Der Vertrag kommt mit unserer Auftragsbestätigung bzw. der Bezahlung des Draft-Order-Angebots zustande.' },
        { h:'Preise und Zahlung', p:'Es gelten die in der Konfiguration angezeigten Preise. Der angezeigte Gesamtbetrag ist der finale, mit BUGO vereinbarte Betrag.' },
        { h:'Produktion und Freigabe', p:'Die Produktion beginnt erst nach Ihrer ausdrücklichen Designfreigabe.' } ] },
      en: { title:'Terms & Conditions', blocks:[
        { h:'Scope', p:'These terms apply to all B2B orders of custom-printed air fresheners via this website.' },
        { h:'Offer and contract', p:'Configurations and quote requests are non-binding. A contract is formed upon our order confirmation or payment of the draft-order offer.' },
        { h:'Prices and payment', p:'The prices shown in the configuration apply. The total shown is the final amount agreed with BUGO.' },
        { h:'Production and approval', p:'Production starts only after your explicit design approval.' } ] },
      fr: { title:'Conditions générales', blocks:[
        { h:'Champ d’application', p:'Ces conditions s’appliquent à toutes les commandes B2B de désodorisants personnalisés via ce site.' },
        { h:'Offre et contrat', p:'Les configurations et demandes de devis sont sans engagement. Le contrat est conclu à notre confirmation ou au paiement de l’offre.' },
        { h:'Prix et paiement', p:'Les prix affichés dans la configuration s’appliquent. Le total affiché est le montant final convenu avec BUGO.' },
        { h:'Production et validation', p:'La production ne commence qu’après votre validation explicite du design.' } ] },
    },
    widerruf: {
      de: { title:'Widerrufsrecht', blocks:[
        { h:'Hinweis für Unternehmer', p:'BUGO DUFT richtet sich an Geschäftskunden (B2B). Ein gesetzliches Verbraucher-Widerrufsrecht besteht daher regelmäßig nicht.' },
        { h:'Individuell gefertigte Ware', p:'Da es sich um nach Kundenvorgaben individuell gestaltete Ware handelt, ist ein Widerruf nach Produktionsfreigabe ausgeschlossen.' } ] },
      en: { title:'Right of Withdrawal', blocks:[
        { h:'Note for businesses', p:'BUGO DUFT serves business customers (B2B); a statutory consumer right of withdrawal generally does not apply.' },
        { h:'Custom-made goods', p:'As goods are individually produced to your specifications, withdrawal is excluded after production approval.' } ] },
      fr: { title:'Droit de rétractation', blocks:[
        { h:'Note pour les professionnels', p:'BUGO DUFT s’adresse aux professionnels (B2B) ; un droit de rétractation consommateur ne s’applique généralement pas.' },
        { h:'Produits sur mesure', p:'S’agissant de produits fabriqués selon vos spécifications, la rétractation est exclue après validation de la production.' } ] },
    },
    versand: {
      de: { title:'Versand & Zahlung', blocks:[
        { h:'Versand', p:'Die Produktion erfolgt nach finaler Designfreigabe in ca. 10–12 Werktagen; insgesamt sind es ca. 15–17 Werktage bis zur Lieferung. Wir liefern europaweit – Versand inklusive, anfallende Zollkosten sind, wo zutreffend, enthalten.' },
        { h:'Zahlung', p:'Die Bezahlung erfolgt sicher über das bereitgestellte Angebot (Shopify Draft Order). Der angezeigte Betrag ist der finale Gesamtpreis.' } ] },
      en: { title:'Shipping & Payment', blocks:[
        { h:'Shipping', p:'Production takes approx. 10–12 working days after final design approval; in total approx. 15–17 working days to your door. We deliver Europe-wide – shipping included, and any applicable customs costs are covered where applicable.' },
        { h:'Payment', p:'Payment is handled securely via the provided offer (Shopify draft order). The amount shown is the final total.' } ] },
      fr: { title:'Livraison & Paiement', blocks:[
        { h:'Livraison', p:'La production prend env. 10–12 jours ouvrés après validation finale du design ; au total env. 15–17 jours ouvrés jusqu’à la livraison. Nous livrons partout en Europe – livraison incluse, et les frais de douane éventuels sont couverts le cas échéant.' },
        { h:'Paiement', p:'Le paiement est sécurisé via l’offre fournie (Shopify draft order). Le montant affiché est le total final.' } ] },
    },
    about: {
      de: { title:'Über BUGO DUFT', blocks:[
        { h:'Individuelle Werbedüfte', p:'BUGO DUFT fertigt individuell bedruckte Duftanhänger für Marken und Unternehmen – inklusive professionellem Grafikdesign.' },
        { h:'Made for your brand', p:'Von der Konfiguration bis zur Produktion begleiten wir Ihr Projekt persönlich.' } ] },
      en: { title:'About BUGO DUFT', blocks:[
        { h:'Custom advertising scents', p:'BUGO DUFT produces custom-printed air fresheners for brands and businesses – including professional graphic design.' },
        { h:'Made for your brand', p:'We accompany your project personally from configuration to production.' } ] },
      fr: { title:'À propos de BUGO DUFT', blocks:[
        { h:'Parfums publicitaires personnalisés', p:'BUGO DUFT fabrique des désodorisants personnalisés pour les marques et les entreprises – design graphique professionnel inclus.' },
        { h:'Made for your brand', p:'Nous accompagnons votre projet personnellement, de la configuration à la production.' } ] },
    },
    b2b: {
      de: { title:'B2B & Großbestellungen', blocks:[
        { h:'Für Unternehmen', p:'Wir beliefern Autohäuser, Werkstätten, Agenturen und viele weitere Branchen mit individuellen Duftanhängern.' },
        { h:'Angebot anfragen', p:'Nutzen Sie das Großbestellungs-Formular auf der Startseite für ein individuelles Angebot.' } ] },
      en: { title:'B2B & Large Orders', blocks:[
        { h:'For businesses', p:'We supply dealerships, workshops, agencies and many other industries with custom air fresheners.' },
        { h:'Request a quote', p:'Use the large-order form on the homepage for a tailored quote.' } ] },
      fr: { title:'B2B & Grandes commandes', blocks:[
        { h:'Pour les entreprises', p:'Nous fournissons concessions, garages, agences et bien d’autres secteurs en désodorisants personnalisés.' },
        { h:'Demander un devis', p:'Utilisez le formulaire de grande commande sur la page d’accueil pour un devis personnalisé.' } ] },
    },
  };
  return staticPages[slug as Exclude<InfoSlug,'impressum'|'datenschutz'>][locale];
}
