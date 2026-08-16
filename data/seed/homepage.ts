import type { Locale } from '@/i18n/config';
type Step = { n:string; title:string; body:string };
type Timeline = { title:string; note:string };
type Usp = { title:string; body:string };
export type HomeContent = {
  announcement: string;
  hero: { eyebrow:string; line1:string; line2:string; line3:string; sub:string };
  metricsNote: string;                 // shown when no verified metrics configured (no fake numbers)
  howItWorks: Step[];
  brandValue: { eyebrow:string; title:string; body:string };
  production: Timeline[];
  whyBugo: Usp[];
  finalCta: { title:string; body:string };
};
const de: HomeContent = {
  announcement: 'Individuelle Werbeduftanhänger · Mindestbestellmenge 1.000 Stück · Produktion in Deutschland',
  hero: { eyebrow:'Individuelle Werbedüfte · Made for your brand',
    line1:'Ihre Marke.', line2:'Ihr Design.', line3:'Ihr Duft.',
    sub:'Individuell gestaltete Duftanhänger für Ihr Unternehmen – mit Ihrem Logo, Ihrem Design und Ihrem Wunschduft. Ab 1.000 Stück, produziert in Deutschland.' },
  metricsNote: 'Kennzahlen werden aus verifizierten Betriebsdaten gepflegt.',
  howItWorks: [
    { n:'01', title:'Logo hochladen', body:'Laden Sie Ihr Logo als Druckdatei hoch – PDF, SVG, AI, EPS oder Bilddatei.' },
    { n:'02', title:'Duft auswählen', body:'Wählen Sie aus unseren Duftwelten den passenden Markenduft.' },
    { n:'03', title:'Design beschreiben', body:'Beschreiben Sie Vorder- und Rückseite, Form und optionale Angaben.' },
    { n:'04', title:'Bestellung abschließen', body:'Menge wählen, prüfen und Bestellung als Gast oder Geschäftskunde abschließen.' },
  ],
  brandValue: { eyebrow:'Markenwirkung', title:'Mehr als ein Duftanhänger. Eine Marke, die in Erinnerung bleibt.',
    body:'Sichtbarkeit, Duft und Wiedererkennung wirken zusammen: Ein individueller Duftanhänger verbindet Ihr Logo mit einem angenehmen Sinneseindruck – und bleibt so länger präsent als klassische Werbeträger.' },
  production: [
    { title:'Auftrag', note:'Bestellung und Design-Brief gehen ein.' },
    { title:'Designprüfung', note:'Ihre Druckdaten werden geprüft und aufbereitet.' },
    { title:'Druck', note:'Vollflächiger Druck Ihres Designs.' },
    { title:'Duftveredelung', note:'Anhänger werden mit dem gewählten Duft veredelt.' },
    { title:'Qualitätskontrolle', note:'Sicht- und Duftprüfung vor der Verpackung.' },
    { title:'Verpackung', note:'Verpackung nach gewählter Option.' },
    { title:'Versand', note:'Versand mit Sendungsverfolgung.' },
  ],
  whyBugo: [
    { title:'Spezialisiert auf B2B', body:'Fokus auf individuelle Werbeduftanhänger für Unternehmen – kein Bauchladen.' },
    { title:'Produktion in Deutschland', body:'Kurze Wege, verlässliche Termine, konsistente Qualität.' },
    { title:'Designfreigabe inklusive', body:'Sie geben jeden Druck vor der Produktion frei – kein Blindkauf.' },
    { title:'Ab 1.000 Stück', body:'Kalkulierbare Staffelpreise für hohe Auflagen.' },
  ],
  finalCta: { title:'Bereit, Ihre Marke zum Duft zu machen?',
    body:'Gestalten Sie Ihren individuellen Duftanhänger oder fordern Sie ein unverbindliches Angebot an.' },
};
const en: HomeContent = {
  announcement: 'Custom promotional air fresheners · Minimum order 1,000 units · Produced in Germany',
  hero: { eyebrow:'Custom promotional scents · Made for your brand',
    line1:'Your brand.', line2:'Your design.', line3:'Your scent.',
    sub:'Custom-designed air fresheners for your company – your logo, your design, your scent. From 1,000 units, produced in Germany.' },
  metricsNote: 'Metrics are maintained from verified operational data.',
  howItWorks: [
    { n:'01', title:'Upload your logo', body:'Upload your logo as a print file – PDF, SVG, AI, EPS or image.' },
    { n:'02', title:'Choose a scent', body:'Pick the right brand scent from our fragrance worlds.' },
    { n:'03', title:'Describe the design', body:'Describe front and back, shape and optional details.' },
    { n:'04', title:'Complete your order', body:'Choose quantity, review and check out as guest or business customer.' },
  ],
  brandValue: { eyebrow:'Brand impact', title:'More than an air freshener. A brand that stays in mind.',
    body:'Visibility, scent and recognition work together: a custom air freshener links your logo to a pleasant sensory impression – staying present longer than classic advertising.' },
  production: [
    { title:'Order', note:'Order and design brief come in.' },
    { title:'Design review', note:'Your print data is checked and prepared.' },
    { title:'Printing', note:'Full-surface print of your design.' },
    { title:'Scent finishing', note:'Tags are finished with the chosen scent.' },
    { title:'Quality control', note:'Visual and scent check before packaging.' },
    { title:'Packaging', note:'Packaging per chosen option.' },
    { title:'Shipping', note:'Shipped with tracking.' },
  ],
  whyBugo: [
    { title:'Specialised in B2B', body:'Focused on custom promotional air fresheners for companies.' },
    { title:'Produced in Germany', body:'Short routes, reliable deadlines, consistent quality.' },
    { title:'Design approval included', body:'You approve every print before production – no blind purchase.' },
    { title:'From 1,000 units', body:'Predictable volume pricing for high runs.' },
  ],
  finalCta: { title:'Ready to turn your brand into a scent?',
    body:'Design your custom air freshener or request a no-obligation quote.' },
};
const fr: HomeContent = {
  announcement: 'Désodorisants publicitaires personnalisés · Commande minimum 1 000 pièces · Produits en Allemagne',
  hero: { eyebrow:'Parfums publicitaires personnalisés · Made for your brand',
    line1:'Votre marque.', line2:'Votre design.', line3:'Votre parfum.',
    sub:'Désodorisants personnalisés pour votre entreprise – votre logo, votre design, votre parfum. Dès 1 000 pièces, produits en Allemagne.' },
  metricsNote: 'Les indicateurs sont alimentés par des données d’exploitation vérifiées.',
  howItWorks: [
    { n:'01', title:'Importer le logo', body:'Importez votre logo en fichier d’impression – PDF, SVG, AI, EPS ou image.' },
    { n:'02', title:'Choisir un parfum', body:'Choisissez le parfum de marque adapté parmi nos univers olfactifs.' },
    { n:'03', title:'Décrire le design', body:'Décrivez recto et verso, la forme et les détails optionnels.' },
    { n:'04', title:'Finaliser la commande', body:'Choisissez la quantité, vérifiez et commandez en invité ou en professionnel.' },
  ],
  brandValue: { eyebrow:'Impact de marque', title:'Plus qu’un désodorisant. Une marque qui reste en mémoire.',
    body:'Visibilité, parfum et reconnaissance agissent ensemble : un désodorisant personnalisé associe votre logo à une impression sensorielle agréable – et reste présent plus longtemps.' },
  production: [
    { title:'Commande', note:'La commande et le brief arrivent.' },
    { title:'Vérification du design', note:'Vos fichiers d’impression sont vérifiés et préparés.' },
    { title:'Impression', note:'Impression pleine surface de votre design.' },
    { title:'Parfumage', note:'Les désodorisants reçoivent le parfum choisi.' },
    { title:'Contrôle qualité', note:'Contrôle visuel et olfactif avant emballage.' },
    { title:'Emballage', note:'Emballage selon l’option choisie.' },
    { title:'Expédition', note:'Expédition avec suivi.' },
  ],
  whyBugo: [
    { title:'Spécialiste du B2B', body:'Focalisé sur les désodorisants publicitaires personnalisés pour entreprises.' },
    { title:'Produit en Allemagne', body:'Circuits courts, délais fiables, qualité constante.' },
    { title:'Validation du design incluse', body:'Vous validez chaque impression avant production.' },
    { title:'Dès 1 000 pièces', body:'Tarifs dégressifs prévisibles pour les grands volumes.' },
  ],
  finalCta: { title:'Prêt à transformer votre marque en parfum ?',
    body:'Créez votre désodorisant personnalisé ou demandez un devis sans engagement.' },
};
const map: Record<Locale, HomeContent> = { de, en, fr };
export function getHome(locale: Locale): HomeContent { return map[locale]; }
