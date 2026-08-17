import type { Locale } from '@/i18n/config';
// CMS-ready homepage content model, fully localized DE/EN/FR.
// Arrays are empty where no real assets exist yet (honest placeholders, no fabrication).

export type Stat = { value: string; label: string };
export type ProdStage = { n: string; title: string; body: string; poster: string | null; video: string | null };
export type Industry = { name: string };
export type Usp = { title: string; body: string };
export type GalleryItem = { src: string; alt: string; orientation: 'portrait' | 'landscape' };
export type LogoItem = { src: string; alt: string };
export type Review = { name: string; company?: string; product?: string; rating: number; text: string; logo?: string };
export type FaqGroup = { group: string; items: { q: string; a: string }[] };
export type BlogPost = { title: string; excerpt: string; href: string; image: string | null; date?: string; category?: string };
export type SupportContact = { title: string; forItems: string[]; whatsapp: string; display: string };
export type Social = { email?: string; instagram?: string; facebook?: string; linkedin?: string };

export type HomeExtra = {
  heroProductImage: string | null;
  heroVideo?: string | null;
  heroPoster?: string | null;
  heroEyebrow?: string;
  heroHead?: string;
  heroSub?: string;
  heroChips: string[];
  shippingIncluded: string;
  credibility: string[];              // e.g. "12+ Jahre Erfahrung"
  stats: Stat[];
  production: ProdStage[];
  industries: Industry[];
  whyBugo: Usp[];
  brandImpact: { title: string; body: string; points: string[] };
  gallery: GalleryItem[];
  referenceLogos: LogoItem[];
  reviews: Review[];
  faqGroups: FaqGroup[];
  blog: BlogPost[];
  support: { grafik: SupportContact; kundenservice: SupportContact };
  social: Social;
};

const WA_GRAFIK = '905072966175';
const WA_SERVICE = '905317234801';

const de: HomeExtra = {
  heroProductImage: null,
  heroChips: ['Ab 1.000 Stück','10–12 Werktage Produktion','ca. 15–17 Werktage Lieferung','Weltweiter Versand'],
  shippingIncluded: 'Versand inklusive',
  credibility: ['12+ Jahre Erfahrung','3–4 Mio. Stück / Monat Kapazität'],
  stats: [
    { value:'12+', label:'Jahre Erfahrung' },
    { value:'3–4 Mio.', label:'Stück / Monat Kapazität' },
    { value:'ab 1.000', label:'Stück Mindestmenge' },
    { value:'10–12', label:'Werktage Produktion' },
    { value:'weltweit', label:'Versand' },
  ],
  production: [
    { n:'01', title:'Druck', body:'Präziser beidseitiger Druck für eine saubere Markenwirkung.', poster:null, video:null },
    { n:'02', title:'Zuschnitt', body:'Individuelle Formen werden passend zum freigegebenen Design gefertigt.', poster:null, video:null },
    { n:'03', title:'Beduftung', body:'Der gewünschte Duft wird kontrolliert und gleichmäßig aufgebracht.', poster:null, video:null },
    { n:'04', title:'Verpackung', body:'Sauber vorbereitet und transportsicher für den Versand verpackt.', poster:null, video:null },
  ],
  industries: ['Autohäuser','Autowaschanlagen','Fahrzeugvermietungen','Werkstätten','Immobilien','Hotels','Gastronomie','Fitnessstudios','Fahrschulen','Versicherungen','Events','Einzelhandel'].map(name=>({name})),
  whyBugo: [
    { title:'12+ Jahre Erfahrung', body:'Etablierte Produktion mit verlässlichen Abläufen.' },
    { title:'Hohe Kapazität', body:'3–4 Mio. Stück pro Monat – auch große Auflagen sind planbar.' },
    { title:'Individuelles Design', body:'Ihr Logo, Ihre Form, Ihr Duft – vollständig gestaltbar.' },
    { title:'Ab 1.000 Stück', body:'Klare Mindestmenge in 1.000er-Schritten.' },
    { title:'Weltweiter Versand', body:'Produktion und Lieferung bis zu Ihnen.' },
    { title:'Planbare Zeiten', body:'10–12 Werktage Produktion, ca. 15–17 Werktage bis zur Lieferung.' },
    { title:'Vorder- & Rückseite flexibel', body:'Unterschiedliche Motive vorne/hinten – gleiche Außenform.' },
    { title:'Designunterstützung', body:'Unser Grafikteam begleitet Ihre Druckdaten.' },
  ],
  brandImpact: {
    title: 'Ein Duft, der Ihre Marke präsent hält.',
    body: 'Ein individueller Duftanhänger verbindet Ihr Logo mit einem angenehmen Sinneseindruck – im Fahrzeug Ihrer Kundschaft, jeden Tag aufs Neue.',
    points: ['Wiederholte Sichtbarkeit im Fahrzeug','Stärkere Markenerinnerung durch Duft','Nützlicher, gern genutzter Werbeartikel','Langlebiger Markenkontakt statt Wegwerf-Werbung','Individuelles Design in Ihrer Markenwelt'],
  },
  gallery: [], referenceLogos: [], reviews: [], blog: [],
  faqGroups: [
    { group:'BESTELLUNG', items:[
      { q:'Wie hoch ist die Mindestbestellmenge?', a:'Die Mindestbestellmenge beträgt 1.000 Stück, in 1.000er-Schritten bis maximal 100.000 Stück.' },
      { q:'Warum nur 1.000er-Schritte?', a:'Die Produktion erfolgt in festen Losgrößen von 1.000 Stück, daher werden Mengen in 1.000er-Schritten konfiguriert.' },
      { q:'Kann ich ohne Kundenkonto bestellen?', a:'Ja. Sie können die Konfiguration abschließen und ohne Konto zur Kasse gehen.' },
    ]},
    { group:'GESTALTUNG', items:[
      { q:'Können Vorder- und Rückseite unterschiedlich sein?', a:'Ja, Vorder- und Rückseite können unterschiedliche Motive haben – ohne Aufpreis.' },
      { q:'Haben beide Seiten dieselbe Form?', a:'Ja. Vorder- und Rückseite verwenden immer dieselbe äußere Form.' },
      { q:'Welche Dateiformate werden unterstützt?', a:'Ideal sind PDF, SVG, AI oder EPS; PNG/JPG sind bei ausreichender Auflösung möglich.' },
      { q:'Gibt es eine individuelle Kontur?', a:'Ja. Eine individuelle Kontur wird von unserem Designteam anhand Ihrer Datei vorbereitet – ohne Aufpreis.' },
      { q:'Kann BUGO die Form bestimmen?', a:'Ja. Auf Wunsch wählt unser Designteam die passende Form zu Ihrem Logo.' },
    ]},
    { group:'DÜFTE', items:[
      { q:'Wie wähle ich den Duft?', a:'Im Konfigurator wählen Sie aus unseren Duftwelten den passenden Markenduft.' },
      { q:'Was ist Intensivduft?', a:'Intensivduft ist eine intensivere Duftveredelung – einmalig +30,00 € pro Konfiguration, nicht pro Stück.' },
    ]},
    { group:'PRODUKTION', items:[
      { q:'Wie lange dauert die Produktion?', a:'Die Produktion dauert in der Regel 10–12 Werktage nach Designfreigabe.' },
      { q:'Bietet BUGO Designunterstützung?', a:'Ja. Unser Grafikteam unterstützt bei Logo, Gestaltung und Druckdaten.' },
    ]},
    { group:'VERSAND & ZAHLUNG', items:[
      { q:'Wie lange bis zur Lieferung?', a:'In der Regel ca. 15–17 Werktage bis zur Lieferung, inklusive Produktion.' },
      { q:'Liefern Sie weltweit?', a:'Ja, wir liefern weltweit.' },
      { q:'Ist der Versand inklusive?', a:'Der Versand ist im Angebot enthalten. Details werden im Checkout ausgewiesen.' },
    ]},
  ],
  support: {
    grafik: { title:'Grafik & Design', forItems:['Logo','Gestaltung','Druckdaten','Dateivorbereitung'], whatsapp:WA_GRAFIK, display:'+90 507 296 61 75' },
    kundenservice: { title:'Kundenservice', forItems:['Bestellung','Produkte','Versand','Allgemeine Fragen'], whatsapp:WA_SERVICE, display:'+90 531 723 48 01' },
  },
  social: {},
};

const en: HomeExtra = {
  heroProductImage: null,
  heroChips: ['From 1,000 units','10–12 working days production','approx. 15–17 working days delivery','Worldwide shipping'],
  shippingIncluded: 'Shipping included',
  credibility: ['12+ years of experience','3–4 million units / month capacity'],
  stats: [
    { value:'12+', label:'years of experience' },
    { value:'3–4M', label:'units / month capacity' },
    { value:'from 1,000', label:'minimum units' },
    { value:'10–12', label:'working days production' },
    { value:'worldwide', label:'shipping' },
  ],
  production: [
    { n:'01', title:'Printing', body:'Precise double-sided printing for a clean brand impression.', poster:null, video:null },
    { n:'02', title:'Cutting', body:'Individual shapes are cut to match the approved design.', poster:null, video:null },
    { n:'03', title:'Scenting', body:'The chosen fragrance is applied evenly and under control.', poster:null, video:null },
    { n:'04', title:'Packaging', body:'Cleanly prepared and securely packed for shipping.', poster:null, video:null },
  ],
  industries: ['Car dealerships','Car washes','Vehicle rentals','Workshops','Real estate','Hotels','Hospitality','Fitness studios','Driving schools','Insurance','Events','Retail'].map(name=>({name})),
  whyBugo: [
    { title:'12+ years of experience', body:'Established production with reliable processes.' },
    { title:'High capacity', body:'3–4 million units per month – large runs are plannable.' },
    { title:'Individual design', body:'Your logo, your shape, your scent – fully customisable.' },
    { title:'From 1,000 units', body:'A clear minimum in steps of 1,000.' },
    { title:'Worldwide shipping', body:'Production and delivery all the way to you.' },
    { title:'Predictable timing', body:'10–12 working days production, approx. 15–17 to delivery.' },
    { title:'Flexible front & back', body:'Different artwork front/back – same outer shape.' },
    { title:'Design support', body:'Our graphics team assists with your print data.' },
  ],
  brandImpact: {
    title: 'A scent that keeps your brand present.',
    body: 'A custom air freshener links your logo to a pleasant sensory impression – inside your customers’ vehicles, day after day.',
    points: ['Repeated visibility inside the vehicle','Stronger brand recall through scent','A useful, welcome promotional item','A long-lasting brand touchpoint, not throwaway advertising','Custom design within your brand world'],
  },
  gallery: [], referenceLogos: [], reviews: [], blog: [],
  faqGroups: [
    { group:'ORDERING', items:[
      { q:'What is the minimum order quantity?', a:'The minimum order is 1,000 units, in steps of 1,000 up to a maximum of 100,000.' },
      { q:'Why only steps of 1,000?', a:'Production runs in fixed lots of 1,000 units, so quantities are configured in steps of 1,000.' },
      { q:'Can I order without an account?', a:'Yes. You can complete the configuration and check out without an account.' },
    ]},
    { group:'DESIGN', items:[
      { q:'Can the front and back be different?', a:'Yes, front and back can have different artwork – at no extra charge.' },
      { q:'Do both sides share the same shape?', a:'Yes. Front and back always use the same outer shape.' },
      { q:'Which file formats are supported?', a:'PDF, SVG, AI or EPS are ideal; PNG/JPG work at sufficient resolution.' },
      { q:'Is a custom contour possible?', a:'Yes. A custom contour is prepared by our design team from your file – at no extra charge.' },
      { q:'Can BUGO choose the shape?', a:'Yes. On request, our design team selects the shape that best fits your logo.' },
    ]},
    { group:'SCENTS', items:[
      { q:'How do I choose the scent?', a:'In the configurator you pick the right brand scent from our fragrance worlds.' },
      { q:'What is Intensive fragrance?', a:'Intensive fragrance is a more intense finishing – a one-time +€30.00 per configuration, not per unit.' },
    ]},
    { group:'PRODUCTION', items:[
      { q:'How long does production take?', a:'Production usually takes 10–12 working days after design approval.' },
      { q:'Does BUGO offer design support?', a:'Yes. Our graphics team helps with logo, design and print data.' },
    ]},
    { group:'SHIPPING & PAYMENT', items:[
      { q:'How long until delivery?', a:'Usually approx. 15–17 working days to delivery, including production.' },
      { q:'Do you ship worldwide?', a:'Yes, we ship worldwide.' },
      { q:'Is shipping included?', a:'Shipping is included in the offer. Details are shown at checkout.' },
    ]},
  ],
  support: {
    grafik: { title:'Graphics & Design', forItems:['Logo','Design','Print data','File preparation'], whatsapp:WA_GRAFIK, display:'+90 507 296 61 75' },
    kundenservice: { title:'Customer service', forItems:['Orders','Products','Shipping','General questions'], whatsapp:WA_SERVICE, display:'+90 531 723 48 01' },
  },
  social: {},
};

const fr: HomeExtra = {
  heroProductImage: null,
  heroChips: ['Dès 1 000 pièces','10–12 jours ouvrés de production','env. 15–17 jours ouvrés de livraison','Livraison mondiale'],
  shippingIncluded: 'Livraison incluse',
  credibility: ['12+ ans d’expérience','Capacité de 3–4 millions de pièces / mois'],
  stats: [
    { value:'12+', label:'ans d’expérience' },
    { value:'3–4 M', label:'pièces / mois' },
    { value:'dès 1 000', label:'pièces minimum' },
    { value:'10–12', label:'jours ouvrés production' },
    { value:'mondiale', label:'livraison' },
  ],
  production: [
    { n:'01', title:'Impression', body:'Impression recto-verso précise pour un rendu de marque net.', poster:null, video:null },
    { n:'02', title:'Découpe', body:'Des formes individuelles sont découpées selon le design validé.', poster:null, video:null },
    { n:'03', title:'Parfumage', body:'Le parfum choisi est appliqué de façon régulière et contrôlée.', poster:null, video:null },
    { n:'04', title:'Emballage', body:'Préparé proprement et emballé pour un transport sécurisé.', poster:null, video:null },
  ],
  industries: ['Concessionnaires','Stations de lavage','Locations de véhicules','Garages','Immobilier','Hôtels','Restauration','Salles de sport','Auto-écoles','Assurances','Événements','Commerce de détail'].map(name=>({name})),
  whyBugo: [
    { title:'12+ ans d’expérience', body:'Une production établie aux processus fiables.' },
    { title:'Grande capacité', body:'3–4 millions de pièces par mois – les grands volumes sont planifiables.' },
    { title:'Design personnalisé', body:'Votre logo, votre forme, votre parfum – entièrement personnalisable.' },
    { title:'Dès 1 000 pièces', body:'Un minimum clair, par tranches de 1 000.' },
    { title:'Livraison mondiale', body:'Production et livraison jusqu’à vous.' },
    { title:'Délais prévisibles', body:'10–12 jours ouvrés de production, env. 15–17 jusqu’à la livraison.' },
    { title:'Recto & verso flexibles', body:'Motifs différents recto/verso – même forme extérieure.' },
    { title:'Accompagnement design', body:'Notre équipe graphique accompagne vos fichiers d’impression.' },
  ],
  brandImpact: {
    title: 'Un parfum qui garde votre marque présente.',
    body: 'Un désodorisant personnalisé associe votre logo à une impression sensorielle agréable – dans le véhicule de vos clients, jour après jour.',
    points: ['Visibilité répétée dans le véhicule','Meilleure mémorisation de la marque grâce au parfum','Un objet publicitaire utile et apprécié','Un contact de marque durable, pas une publicité jetable','Un design personnalisé dans votre univers de marque'],
  },
  gallery: [], referenceLogos: [], reviews: [], blog: [],
  faqGroups: [
    { group:'COMMANDE', items:[
      { q:'Quelle est la quantité minimum de commande ?', a:'La commande minimum est de 1 000 pièces, par tranches de 1 000 jusqu’à 100 000.' },
      { q:'Pourquoi uniquement par tranches de 1 000 ?', a:'La production se fait par lots fixes de 1 000 pièces ; les quantités se configurent donc par tranches de 1 000.' },
      { q:'Puis-je commander sans compte ?', a:'Oui. Vous pouvez terminer la configuration et payer sans compte.' },
    ]},
    { group:'DESIGN', items:[
      { q:'Le recto et le verso peuvent-ils être différents ?', a:'Oui, le recto et le verso peuvent avoir des motifs différents – sans supplément.' },
      { q:'Les deux faces ont-elles la même forme ?', a:'Oui. Le recto et le verso utilisent toujours la même forme extérieure.' },
      { q:'Quels formats de fichiers sont acceptés ?', a:'PDF, SVG, AI ou EPS sont idéaux ; PNG/JPG conviennent avec une résolution suffisante.' },
      { q:'Une découpe personnalisée est-elle possible ?', a:'Oui. Une découpe personnalisée est préparée par notre équipe design à partir de votre fichier – sans supplément.' },
      { q:'BUGO peut-il choisir la forme ?', a:'Oui. Sur demande, notre équipe design choisit la forme la mieux adaptée à votre logo.' },
    ]},
    { group:'PARFUMS', items:[
      { q:'Comment choisir le parfum ?', a:'Dans le configurateur, vous choisissez le parfum de marque adapté parmi nos univers olfactifs.' },
      { q:'Qu’est-ce que le parfum intense ?', a:'Le parfum intense est une finition plus intense – +30,00 € une seule fois par configuration, pas par pièce.' },
    ]},
    { group:'PRODUCTION', items:[
      { q:'Combien de temps dure la production ?', a:'La production dure en général 10–12 jours ouvrés après validation du design.' },
      { q:'BUGO propose-t-il un accompagnement design ?', a:'Oui. Notre équipe graphique aide pour le logo, le design et les fichiers d’impression.' },
    ]},
    { group:'LIVRAISON & PAIEMENT', items:[
      { q:'Quel délai jusqu’à la livraison ?', a:'En général env. 15–17 jours ouvrés jusqu’à la livraison, production comprise.' },
      { q:'Livrez-vous dans le monde entier ?', a:'Oui, nous livrons dans le monde entier.' },
      { q:'La livraison est-elle incluse ?', a:'La livraison est comprise dans l’offre. Les détails sont indiqués au paiement.' },
    ]},
  ],
  support: {
    grafik: { title:'Graphisme & Design', forItems:['Logo','Design','Fichiers d’impression','Préparation des fichiers'], whatsapp:WA_GRAFIK, display:'+90 507 296 61 75' },
    kundenservice: { title:'Service client', forItems:['Commande','Produits','Livraison','Questions générales'], whatsapp:WA_SERVICE, display:'+90 531 723 48 01' },
  },
  social: {},
};

const map: Record<Locale, HomeExtra> = { de, en, fr };
export function getHomeContent(locale: Locale): HomeExtra { return map[locale]; }
