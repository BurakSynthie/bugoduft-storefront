'use client';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import type { Locale } from '@/i18n/config';
import { formatMoney, formatQty } from '@/lib/money';
import { validateQuantity, quantityMessage } from '@/lib/quantity';
import { priceQuantitySafe, type PriceTier } from '@/lib/pricing/tiers';
import type { ArtworkRef, BugoConfiguration, Intensity, ShapeId } from '@/lib/configurator/types';
import { firstConfigError, type ConfigError } from '@/lib/configurator/pricing';
import { SHAPES, isDeferred, shapeGeometry } from '@/lib/configurator/shapes';
import Upload from './Upload';
import { useStorefront } from '@/lib/cart/store';
import { persistItemFiles } from '@/lib/cart/checkout-client';
import type { CartItem } from '@/lib/cart/types';
import { sf, WA } from '@/lib/i18n/storefront';
import { business } from '@/config/site';
import {
  loadDraft, saveDraft, clearDraft, isMeaningful, getLive, setLive, newConfigId,
  metaOf, refFromMeta, setFrontFile, setBackFile, setSupportingFiles, hasSessionFiles, type CfgDraft,
} from '@/lib/configurator/draft';

export type CfgCollection = { collectionCode:string; collectionName:string; productId:string; basePriceCents:number; scentCodes:string[]; tiers?:PriceTier[];
  // §HIGH-4 per-product intensive-fragrance rate (€/1.000) and §HIGH-6 per-product quantity rules.
  intenseCents?:number; minQty?:number; maxQty?:number; qtyStep?:number };
export type CfgScent = { code:string; category:string; name:string; description:string };

// §INTRO-250-500 valid quantities, in display order. 250 & 500 are the two fixed intro entries
// (shown only for products that price them); the rest is the 1.000 ladder. NO intermediate
// quantity (750 / 1.250 / 1.500 …) ever appears — the filter below enforces this.
const QUICK = [250,500,1000,2000,3000,5000,10000,25000,50000,100000];
const CATS = ['frisch','fruchtig','suess','elegant','intensiv'] as const;

// Localized shape labels for the cart summary (the configurator tiles keep their
// existing labels; this only prevents German leakage in the new cart UI).
const SHAPE_L: Record<ShapeId, Record<Locale,string>> = {
  rectangle:{de:'Rechteck',en:'Rectangle',fr:'Rectangle'},
  square:{de:'Quadrat',en:'Square',fr:'Carré'},
  round:{de:'Rund',en:'Round',fr:'Rond'},
  oval:{de:'Oval',en:'Oval',fr:'Ovale'},
  shield:{de:'Wappen',en:'Shield',fr:'Blason'},
  heart:{de:'Herz',en:'Heart',fr:'Cœur'},
  bugo_decides:{de:'Form von BUGO bestimmen lassen',en:'Let BUGO choose the shape',fr:'Laisser BUGO choisir la forme'},
  custom_contour:{de:'Individuelle Kontur',en:'Custom contour',fr:'Contour personnalisé'},
};

const L = {
  de:{ collection:'Kollektion', qty:'Menge', qtyOther:'Andere Menge', scent:'Duft', intensity:'Duftintensität',
    normal:'Normalduft', intense:'Intensivduft', shape:'Form', front:'Vorderseite', back:'Rückseite',
    identical:'Vorder- und Rückseite identisch', review:'Prüfung', designTeam:'Hinweise für unser Designteam',
    frontNotes:'Anmerkungen zur Vorderseite', backNotes:'Anmerkungen zur Rückseite',
    uploadFront:'Vorderseite / Logo hochladen', uploadBack:'Rückseite hochladen', supporting:'Weitere Dateien (optional)',
    ph:'Logo mittig, Telefonnummer unten, schwarzer Hintergrund.', next:'Weiter', prev:'Zurück',
    finish:'Konfiguration abschließen', designStatus:'Designstatus', price:'Preis', pieces:'Stück',
    identicalShort:'identisch', ready:'Bereit zur Prüfung', incomplete:'Unvollständig',
    previewNote:'Die Vorschau dient zur Orientierung. Die finale Druckdatei wird von unserem Designteam geprüft.',
    deferredNote:'Die finale Produktionsform wird von unserem Designteam anhand Ihrer Datei vorbereitet.',
    yourLogo:'Ihr Logo', step:'Schritt', of:'von', chooseScent:'Bitte wählen Sie einen Duft.', all:'Alle',
    done:'Konfiguration bereit',
    doneNote:'Ihre Konfiguration ist vollständig und für den nächsten Schritt vorbereitet.', edit:'Bearbeiten',
    cord:'Kordel: Schwarz (fest)', finalPriceNote:'Ihr finaler BUGO-Preis — keine weiteren BUGO-Aufpreise danach.' },
  en:{ collection:'Collection', qty:'Quantity', qtyOther:'Other quantity', scent:'Scent', intensity:'Fragrance intensity',
    normal:'Normal', intense:'Intensive', shape:'Shape', front:'Front', back:'Back',
    identical:'Front and back identical', review:'Review', designTeam:'Notes for our design team',
    frontNotes:'Notes for the front', backNotes:'Notes for the back',
    uploadFront:'Upload front / logo', uploadBack:'Upload back', supporting:'Additional files (optional)',
    ph:'Logo centered, phone number at the bottom, black background.', next:'Next', prev:'Back',
    finish:'Complete configuration', designStatus:'Design status', price:'Price', pieces:'units',
    identicalShort:'identical', ready:'Ready for review', incomplete:'Incomplete',
    previewNote:'The preview is for orientation only. The final print file is checked by our design team.',
    deferredNote:'The final production shape is prepared by our design team from your file.',
    yourLogo:'Your logo', step:'Step', of:'of', chooseScent:'Please choose a scent.', all:'All',
    done:'Configuration ready',
    doneNote:'Your configuration is complete and prepared for the next step.', edit:'Edit',
    cord:'Cord: black (fixed)', finalPriceNote:'Your final BUGO price — no further BUGO charges after this.' },
  fr:{ collection:'Collection', qty:'Quantité', qtyOther:'Autre quantité', scent:'Parfum', intensity:'Intensité du parfum',
    normal:'Normal', intense:'Intense', shape:'Forme', front:'Recto', back:'Verso',
    identical:'Recto et verso identiques', review:'Vérification', designTeam:'Remarques pour notre équipe design',
    frontNotes:'Remarques pour le recto', backNotes:'Remarques pour le verso',
    uploadFront:'Importer recto / logo', uploadBack:'Importer verso', supporting:'Fichiers supplémentaires (optionnel)',
    ph:'Logo centré, numéro de téléphone en bas, fond noir.', next:'Suivant', prev:'Retour',
    finish:'Terminer la configuration', designStatus:'Statut du design', price:'Prix', pieces:'pièces',
    identicalShort:'identique', ready:'Prêt pour vérification', incomplete:'Incomplet',
    previewNote:'L’aperçu est indicatif. Le fichier d’impression final est vérifié par notre équipe design.',
    deferredNote:'La forme de production finale est préparée par notre équipe design à partir de votre fichier.',
    yourLogo:'Votre logo', step:'Étape', of:'sur', chooseScent:'Veuillez choisir un parfum.', all:'Tous',
    done:'Configuration prête',
    doneNote:'Votre configuration est complète et préparée pour l’étape suivante.', edit:'Modifier',
    cord:'Cordon : noir (fixe)', finalPriceNote:'Votre prix BUGO final — aucun frais BUGO supplémentaire ensuite.' },
} as const;

// Design-mode copy: BUGO creates vs. customer provides a ready print file.
const DM: Record<Locale,{ title:string; bugo:string; bugoHint:string; ready:string; readyHint:string; bugoNote:string; readyNote:string; uploadReady:string }> = {
  de:{ title:'Design', bugo:'BUGO gestaltet mein Design', bugoHint:'Kostenlos, inkl. Korrekturen & Freigabe.',
    ready:'Ich habe eine fertige Druckdatei', readyHint:'PDF/PNG/JPG – wir prüfen sie vor der Produktion.',
    bugoNote:'Laden Sie Logo/Vorlagen hoch – wir erstellen den professionellen Entwurf und stimmen ihn mit Ihnen ab.',
    readyNote:'Laden Sie Ihre finale Druckdatei hoch. Wir prüfen Auflösung, Beschnitt und Formen vor der Produktion – Sie erhalten eine Freigabe.',
    uploadReady:'Druckdatei hochladen (PDF/PNG/JPG)' },
  en:{ title:'Design', bugo:'BUGO creates my design', bugoHint:'Free, incl. revisions & approval.',
    ready:'I have a ready print file', readyHint:'PDF/PNG/JPG – we check it before production.',
    bugoNote:'Upload your logo/assets – we create the professional proof and align it with you.',
    readyNote:'Upload your final print file. We check resolution, bleed and shapes before production – you receive an approval.',
    uploadReady:'Upload print file (PDF/PNG/JPG)' },
  fr:{ title:'Design', bugo:'BUGO crée mon design', bugoHint:'Gratuit, corrections & validation incluses.',
    ready:'J’ai un fichier d’impression prêt', readyHint:'PDF/PNG/JPG – vérifié avant production.',
    bugoNote:'Importez votre logo/éléments – nous créons le BAT professionnel et le validons avec vous.',
    readyNote:'Importez votre fichier final. Nous vérifions résolution, fond perdu et formes avant production – vous recevez une validation.',
    uploadReady:'Importer le fichier (PDF/PNG/JPG)' },
};

const catLabel: Record<Locale,Record<string,string>> = {
  de:{frisch:'Frisch',fruchtig:'Fruchtig',suess:'Süß',elegant:'Elegant',intensiv:'Intensiv'},
  en:{frisch:'Fresh',fruchtig:'Fruity',suess:'Sweet',elegant:'Elegant',intensiv:'Intense'},
  fr:{frisch:'Frais',fruchtig:'Fruité',suess:'Sucré',elegant:'Élégant',intensiv:'Intense'},
};

// Second, optional, FREE scent copy (no surcharge, no price change).
const L2: Record<Locale,{ add:string; noSurcharge:string; hint:string; d1:string; d2:string; remove:string; free:string; choose2:string }> = {
  de:{ add:'+ Zweiten Duft kostenlos wählen', noSurcharge:'2 Düfte ohne Aufpreis',
    hint:'Auf Wunsch können Sie für Ihre Bestellung einen zweiten Duft auswählen.',
    d1:'Duft 1', d2:'Duft 2', remove:'Entfernen', free:'kostenlos', choose2:'Zweiten Duft wählen' },
  en:{ add:'+ Choose a second fragrance for free', noSurcharge:'2 fragrances at no extra charge',
    hint:'If you like, you can add a second fragrance to your order.',
    d1:'Scent 1', d2:'Scent 2', remove:'Remove', free:'free', choose2:'Choose a second fragrance' },
  fr:{ add:'+ Choisir un deuxième parfum gratuitement', noSurcharge:'2 parfums sans supplément',
    hint:'Si vous le souhaitez, vous pouvez ajouter un deuxième parfum à votre commande.',
    d1:'Parfum 1', d2:'Parfum 2', remove:'Retirer', free:'gratuit', choose2:'Choisir un deuxième parfum' },
};

const SHAPE_PREVIEW_L: Record<Locale,{ pending:string; preview:string }> = {
  de:{ pending:'Form wird vom Designteam vorbereitet', preview:'Vorschau' },
  en:{ pending:'Shape is being prepared by our design team', preview:'Preview' },
  fr:{ pending:'La forme est préparée par notre équipe de design', preview:'Aperçu' },
};
function ShapePreview({ shape, artwork, yourLogo, locale }:{ shape:ShapeId; artwork:ArtworkRef|null; yourLogo:string; locale:Locale }) {
  const geo = shapeGeometry(shape);
  const cid = `clip-${shape}-${Math.random().toString(36).slice(2,7)}`;
  const pl = SHAPE_PREVIEW_L[locale];
  if (!geo) {
    return (<svg viewBox="0 0 100 120" role="img" aria-label={pl.pending}>
      <rect x="6" y="6" width="88" height="108" rx="10" fill="#EEF3FA" stroke="#B4690E" strokeDasharray="4 4" strokeWidth="1.5"/>
      <text x="50" y="62" textAnchor="middle" fontSize="7" fill="#8A5A12">BUGO</text></svg>);
  }
  return (
    <svg viewBox="0 0 100 120" role="img" aria-label={pl.preview}>
      <defs><clipPath id={cid}>{geo}</clipPath></defs>
      <g clipPath={`url(#${cid})`}>
        {artwork?.previewUrl
          ? <image href={artwork.previewUrl} x="0" y="0" width="100" height="120" preserveAspectRatio="xMidYMid slice"/>
          : <><rect x="0" y="0" width="100" height="120" fill="#F4F8FE"/><text x="50" y="63" textAnchor="middle" fontSize="7" fill="#9FB2CC">{yourLogo}</text></>}
      </g>
      <g fill="none" stroke="#1268E8" strokeWidth="2">{geo}</g>
    </svg>
  );
}

// Compact step names shown in the progress indicator. Order matches the actual
// configurator steps (0..7): Collection, Quantity, Fragrance, Intensity, Shape,
// Front, Back, Review — derived, not an invented wizard.
const STEP_NAMES: Record<Locale, string[]> = {
  de: ['Kollektion','Menge','Duft','Intensität','Form','Vorderseite','Rückseite','Überprüfung'],
  en: ['Collection','Quantity','Fragrance','Intensity','Shape','Front','Back','Review'],
  fr: ['Collection','Quantité','Parfum','Intensité','Forme','Recto','Verso','Vérification'],
};

export default function Configurator({ locale, collections, scents, intenseCents, initialCollection, sampleThreshold = 5000, sampleValueEur = 40, contactEmail, contactWhatsapp }:
  { locale:Locale; collections:CfgCollection[]; scents:CfgScent[]; intenseCents:number; initialCollection?:string; sampleThreshold?:number; sampleValueEur?:number; contactEmail?:string|null; contactWhatsapp?:string|null }) {
  // Single source of truth (Phase 6E-B2 §6-7): prefer Admin -> Ayarlar contact info;
  // fall back to the shipped WhatsApp/email constants only when settings are unconfigured.
  const waDigits = (contactWhatsapp ?? '').replace(/\D/g,'');
  const waDesign = waDigits || WA.design;
  const waSupport = waDigits || WA.support;
  const supportEmail = contactEmail || business.adminNotificationEmail;
  const t = L[locale];
  const T = sf(locale);
  const cart = useStorefront();
  const router = useRouter();

  const [collectionCode, setCollectionCode] = useState(initialCollection && collections.find(c=>c.collectionCode===initialCollection) ? initialCollection : collections[0]?.collectionCode);
  const col = collections.find(c=>c.collectionCode===collectionCode) ?? collections[0];

  const [quantity, setQuantity] = useState(1000);
  const [qtyText, setQtyText] = useState('');
  const [scentCode, setScentCode] = useState<string|null>(null);
  const [scentCode2, setScentCode2] = useState<string|null>(null);
  const [designMode, setDesignMode] = useState<'bugo_creates'|'ready_file'>('bugo_creates');
  const [showSecond, setShowSecond] = useState(false);
  const [scentCat, setScentCat] = useState<string>('all');
  const [intensity, setIntensity] = useState<Intensity>('normal');
  const [shape, setShape] = useState<ShapeId>('rectangle');
  const [front, setFront] = useState<ArtworkRef|null>(null);
  const [frontNotes, setFrontNotes] = useState('');
  const [sameBack, setSameBack] = useState(true);
  const [back, setBack] = useState<ArtworkRef|null>(null);
  const [backNotes, setBackNotes] = useState('');
  const [supporting, setSupporting] = useState<ArtworkRef[]>([]);
  // §HIGH-14 persisted artwork storage references carried through cart Edit + reload. Front/back
  // paths live on the ArtworkRef.storagePath (set only when restored from a persisted cart item);
  // supporting paths and the "already persisted" flag are tracked here so buildCartItem preserves
  // them unless the user explicitly replaces/removes the upload.
  const [supportingPaths, setSupportingPaths] = useState<{ field: string; path: string }[]>([]);
  const [filesPersisted, setFilesPersisted] = useState(false);
  const [step, setStep] = useState(0);
  const [adding, setAdding] = useState(false);
  const [stepError, setStepError] = useState<string|null>(null);
  const [recover, setRecover] = useState<CfgDraft|null>(null);
  const [hydrated, setHydrated] = useState(false);
  const [exitOpen, setExitOpen] = useState(false);

  const configIdRef = useRef<string>('');
  if (!configIdRef.current) configIdRef.current = newConfigId();

  // configurator owns the mobile chrome: hide global bottom nav while active
  useEffect(()=>{ document.body.classList.add('cfg-active'); try { window.bugoTrack?.('start_configurator'); } catch {} return ()=>document.body.classList.remove('cfg-active'); },[]);

  // ---- draft restore (silent on continuation; recovery banner on fresh session return) ----
  function applyDraft(d: CfgDraft) {
    if (d.collectionCode && collections.find(c=>c.collectionCode===d.collectionCode)) setCollectionCode(d.collectionCode);
    setQuantity(d.quantity || 1000); setQtyText(d.qtyText || '');
    setScentCode(d.scentCode); setScentCat(d.scentCat || 'all');
    setScentCode2(d.scentCode2 ?? null); setShowSecond(!!d.scentCode2);
    if(d.designMode) setDesignMode(d.designMode);
    setIntensity(d.intensity); setShape(d.shape);
    // §HIGH-14 restore persisted storage paths so an unchanged upload survives Edit/reload.
    setFront(refFromMeta(d.frontMeta, d.frontPath ?? null)); setFrontNotes(d.frontNotes || '');
    setSameBack(d.sameBack); setBack(refFromMeta(d.backMeta, d.backPath ?? null)); setBackNotes(d.backNotes || '');
    setSupporting(d.supportingMeta.map(m => refFromMeta(m)).filter(Boolean) as ArtworkRef[]);
    setSupportingPaths(d.supportingPaths ?? []);
    setFilesPersisted(d.filesPersisted ?? false);
    setStep(Math.min(7, Math.max(0, d.step || 0)));
  }
  useEffect(()=>{
    const explicit = initialCollection && collections.find(c=>c.collectionCode===initialCollection) ? initialCollection : null;
    const d = loadDraft();
    const live = getLive();
    // Explicit product selection from a Product Detail CTA (?k=) must win over a
    // stale draft. Only continue a draft silently if it's for the SAME collection.
    if (explicit) {
      if (d && live === d.configId && d.collectionCode === explicit) { configIdRef.current = d.configId; applyDraft(d); setLive(d.configId); }
      else { setCollectionCode(explicit); configIdRef.current = newConfigId(); setLive(configIdRef.current); }
      setHydrated(true); return;
    }
    if (d && live === d.configId) { configIdRef.current = d.configId; applyDraft(d); setLive(d.configId); }
    else if (isMeaningful(d) && d) { configIdRef.current = d.configId; setRecover(d); }
    else {
      try { const k = new URLSearchParams(window.location.search).get('k');
        if (k && collections.find(c=>c.collectionCode===k)) setCollectionCode(k); } catch {}
      setLive(configIdRef.current);
    }
    setHydrated(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[]);

  const available = useMemo(()=> scents.filter(s=> col?.scentCodes.includes(s.code)), [scents, col]);
  useEffect(()=>{ if(scentCode && !available.find(s=>s.code===scentCode)) setScentCode(null); },[available,scentCode]);
  useEffect(()=>{ if(scentCode2 && (!available.find(s=>s.code===scentCode2) || scentCode2===scentCode)) setScentCode2(null); },[available,scentCode2,scentCode]);
  const shownScents = scentCat==='all' ? available : available.filter(s=>s.category===scentCat);

  const base = col?.basePriceCents ?? 0;
  const cfgTiers: PriceTier[] = (col?.tiers && col.tiers.length) ? col.tiers : [{ minQty:1000, ratePer1000Cents: base }];
  // §HIGH-4 the intensive rate belongs to the SELECTED product (not products[0]); prop is the fallback.
  const colIntenseCents = col?.intenseCents ?? intenseCents;
  // §INTRO-250-500 this product offers the 250/500 intro entries iff it carries a price tier for
  // them (mirrors the server: validation and pricing both hinge on an actual intro tier).
  const allowIntro = cfgTiers.some(t => t.minQty === 250 || t.minQty === 500);
  // §HIGH-6 the SELECTED product's quantity rules (fall back to the canonical envelope).
  const qtyRules = { min: col?.minQty ?? 1000, max: col?.maxQty ?? 100000, step: col?.qtyStep ?? 1000, allowIntro };
  // §HIGH-11 quick buttons must match the product's real step-from-min rule (aligns to min, not 0).
  // §INTRO-250-500 the two intro quantities are always offered when allowed; they are exceptions to
  // the min/step ladder and never imply any intermediate quantity (750 / 1.250 …).
  const quickQtys = QUICK.filter(n =>
    (allowIntro && (n === 250 || n === 500))
    || (n >= qtyRules.min && n <= qtyRules.max && (n - qtyRules.min) % qtyRules.step === 0));
  // §P0/HIGH-12 never invent a price when no tier covers the quantity (server is authoritative).
  const qp = priceQuantitySafe(cfgTiers, quantity)
    ?? { ratePer1000Cents: base, totalCents: 0, baseTotalCents: 0, savingsCents: 0, badge: null };
  const surchargeCents = intensity === 'intense' ? Math.round(colIntenseCents * (quantity / 1000)) : 0;
  const unitRateCents = qp.ratePer1000Cents;
  const total = qp.totalCents + surchargeCents;          // full order total (display; server is authority)
  const savingsCents = qp.savingsCents;
  const freeSample = sampleThreshold > 0 && quantity >= sampleThreshold;
  const qtyErr = validateQuantity(quantity, qtyRules);
  const backArtwork = sameBack ? front : back;

  // §HIGH-6 when switching to a product with stricter rules, clamp an out-of-range quantity
  // to that product's minimum so the client never shows a quantity the server would reject.
  useEffect(()=>{ if (hydrated && validateQuantity(quantity, qtyRules)) { setQuantity(qtyRules.min); setQtyText(''); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[collectionCode]);

  const Y = STEP_NAMES[locale].length;   // real step count (derived, not hardcoded)

  // ---- file registry wrappers (binaries never persisted to localStorage) ----
  // §HIGH-14 choosing a NEW binary means the stored path no longer represents current artwork →
  // mark not-persisted so it is re-uploaded at add. A plain restore (r.storagePath set, no file)
  // or an unrelated edit never clears an existing path.
  function chooseFront(r:ArtworkRef|null){ setFront(r); setFrontFile(configIdRef.current, r?.file ?? null); if (r?.file) setFilesPersisted(false); }
  function chooseBack(r:ArtworkRef|null){ setBack(r); setBackFile(configIdRef.current, r?.file ?? null); if (r?.file) setFilesPersisted(false); }
  function addSupporting(r:ArtworkRef){ setSupporting(s=>{ const n=[...s,r]; setSupportingFiles(configIdRef.current, n.map(x=>x.file??null)); return n; }); setFilesPersisted(false); }
  function removeSupporting(i:number){ setSupporting(s=>{ const n=s.filter((_,j)=>j!==i); setSupportingFiles(configIdRef.current, n.map(x=>x.file??null)); return n; }); setFilesPersisted(false); }

  function selectQuick(n:number){ setQuantity(n); setQtyText(''); }
  function applyQtyText(v:string){ setQtyText(v); const n=parseInt(v.replace(/\D/g,''),10); if(Number.isFinite(n)) setQuantity(n); }

  const buildConfig = (): BugoConfiguration => ({
    productId: col.productId, collectionCode: col.collectionCode, quantity,
    scentCode, scentCode2, designMode, intensity, shape,
    frontArtwork: front, frontInstructions: frontNotes,
    sameBackAsFront: sameBack, backArtwork: sameBack ? null : back, backInstructions: sameBack ? '' : backNotes,
    supportingFiles: supporting, basePriceCents: base, surchargeCents, totalPriceCents: total,
    currency:'EUR', locale,
  });

  const currentDraft = (): CfgDraft => ({
    v:1, configId: configIdRef.current, collectionCode,
    quantity, qtyText, scentCode, scentCode2, designMode, scentCat, intensity, shape,
    frontMeta: metaOf(front), frontNotes, sameBack, backMeta: metaOf(back), backNotes,
    supportingMeta: supporting.map(s=>({ name:s.name, type:s.type, size:s.size })),
    // §HIGH-14 persist storage references + persisted flag in the autosaved draft.
    frontPath: front?.storagePath ?? null, backPath: sameBack ? null : (back?.storagePath ?? null),
    supportingPaths, filesPersisted,
    step, locale, updatedAt: Date.now(),
  });

  // ---- autosave (debounced) ----
  const saveTimer = useRef<ReturnType<typeof setTimeout>|null>(null);
  useEffect(()=>{
    if (!hydrated || recover) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(()=> saveDraft(currentDraft()), 300);
    return ()=>{ if (saveTimer.current) clearTimeout(saveTimer.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[hydrated, recover, collectionCode, quantity, qtyText, scentCode, scentCode2, designMode, scentCat, intensity, shape, front, frontNotes, sameBack, back, backNotes, supporting, supportingPaths, filesPersisted, step]);

  // clear inline step error when the relevant inputs / step change
  useEffect(()=>{ setStepError(null); },[step, front, frontNotes, back, backNotes, scentCode, quantity, sameBack]);

  const scentName = scents.find(s=>s.code===scentCode)?.name ?? null;
  const scentName2 = scents.find(s=>s.code===scentCode2)?.name ?? null;
  const shapeLabel = SHAPE_L[shape][locale];
  const designStatus = front && frontNotes.trim() && (sameBack || (back && backNotes.trim())) ? t.ready : t.incomplete;

  // ---- validation ----
  function mobileStepError(s:number): string|null {
    if (s===1 && qtyErr) return quantityMessage(qtyErr, locale, qtyRules);
    if (s===2 && !scentCode) return t.chooseScent;
    if (s===5) { if (!front) return T.reqFrontFile; if (!frontNotes.trim()) return T.reqFrontNotes; }
    if (s===6 && !sameBack) { if (!back) return T.reqBackFile; if (!backNotes.trim()) return T.reqBackNotes; }
    return null;
  }
  function next(){
    const err = mobileStepError(step);
    if (err) { setStepError(err); return; }
    setStepError(null); setStep(s=>Math.min(7,s+1));
  }
  function errStep(e:ConfigError): number {
    switch(e){ case 'quantity':return 1; case 'scent':return 2; case 'shape':return 4;
      case 'front_file': case 'front_instructions': return 5;
      case 'back_file': case 'back_instructions': return 6; default:return 7; }
  }
  function errMessage(e:ConfigError): string {
    switch(e){ case 'quantity':return quantityMessage(qtyErr, locale, qtyRules) ?? '';
      case 'scent':return t.chooseScent;
      case 'front_file':return T.reqFrontFile; case 'front_instructions':return T.reqFrontNotes;
      case 'back_file':return T.reqBackFile; case 'back_instructions':return T.reqBackNotes; default:return ''; }
  }

  // ---- cart ----
  const addedRef = useRef(false);
  function buildCartItem(): CartItem {
    return {
      cartItemId: `ci-${configIdRef.current}`, configId: configIdRef.current,
      productId: col.productId, collectionCode: col.collectionCode, collectionName: col.collectionName,
      quantity, scentCode, scentName, scentCode2, scentName2, intensity, designMode, shape, shapeLabel: SHAPE_L[shape][locale],
      frontName: front?.name ?? null, frontMeta: metaOf(front), frontInstructions: frontNotes,
      sameBackAsFront: sameBack,
      backName: sameBack ? null : (back?.name ?? null), backMeta: sameBack ? null : metaOf(back),
      backInstructions: sameBack ? '' : backNotes,
      // §HIGH-14 carry persisted storage references forward — never blindly null them. front/back
      // paths come from the ArtworkRef.storagePath (restored on edit, null after explicit replace/
      // remove); supporting paths + the persisted flag are tracked separately.
      frontPath: front?.storagePath ?? null,
      backPath: sameBack ? null : (back?.storagePath ?? null),
      supporting: supportingPaths, filesPersisted,
      basePriceCents: base, surchargeCents, priceCents: total, currency:'EUR', locale, updatedAt: Date.now(),
    };
  }
  function addToCart(){
    if (adding) return;
    const e = firstConfigError(buildConfig(), qtyRules);
    if (e) { setStep(errStep(e)); setStepError(errMessage(e)); return; }
    setAdding(true);
    const item = buildCartItem();
    cart.addOrUpdate(item);
    addedRef.current = true;
    try { window.bugoTrack?.('add_to_cart', { quantity }); } catch {}
    setExitOpen(false);
    cart.openCart();
    setAdding(false);
    // §HIGH-14 only upload when there are NEW in-session binaries. After a reload there are none,
    // so we must NOT run the upload path and overwrite preserved paths with nulls. When we do
    // upload, MERGE: a freshly-uploaded path replaces; otherwise the existing item path is kept.
    if (hasSessionFiles(configIdRef.current)) {
      persistItemFiles(item).then(res=>{
        if (res.ok) cart.addOrUpdate({
          ...item,
          frontPath: res.frontPath ?? item.frontPath,
          backPath: res.backPath ?? item.backPath,
          supporting: res.supporting.length ? res.supporting : item.supporting,
          filesPersisted: true,
        });
      }).catch(()=>{});
    }
  }

  // ---- recovery banner actions ----
  function continueDraft(){ if (recover){ applyDraft(recover); setLive(recover.configId); } setRecover(null); }
  function resetDraft(){
    clearDraft(); const id = newConfigId(); configIdRef.current = id; setLive(id);
    setCollectionCode(collections[0]?.collectionCode); setQuantity(1000); setQtyText('');
    setScentCode(null); setScentCat('all'); setIntensity('normal'); setShape('rectangle');
    // §MEDIUM-15 a reset must return to a GENUINE clean default — no stale second-scent, design
    // mode, or upload/persistence state bleeding from the previous configuration.
    setScentCode2(null); setShowSecond(false); setDesignMode('bugo_creates');
    setSupportingPaths([]); setFilesPersisted(false);
    setFront(null); setFrontNotes(''); setSameBack(true); setBack(null); setBackNotes(''); setSupporting([]); setStep(0);
    setRecover(null);
  }

  // ---- exit intent (desktop mouse-leave + idle) + conservative unload guard ----
  const stateRef = useRef({ meaningful:false, added:false });
  stateRef.current = {
    meaningful: step>0 || !!scentCode || !!front || !!frontNotes.trim(),
    added: addedRef.current,
  };
  const exitShown = useRef(false);
  function maybeExit(){
    if (exitShown.current) return;
    if (!stateRef.current.meaningful || stateRef.current.added) return;
    exitShown.current = true; setExitOpen(true);
  }
  useEffect(()=>{
    function onMouseOut(e:MouseEvent){ if (e.clientY<=0 && !e.relatedTarget) maybeExit(); }
    document.addEventListener('mouseout', onMouseOut);
    let idle = setTimeout(function tick(){ maybeExit(); }, 120000);
    const reset = ()=>{ clearTimeout(idle); idle = setTimeout(()=>maybeExit(), 120000); };
    window.addEventListener('pointerdown', reset, { passive:true });
    window.addEventListener('keydown', reset);
    function onUnload(e:BeforeUnloadEvent){
      if (stateRef.current.meaningful && !stateRef.current.added && hasSessionFiles(configIdRef.current)) { e.preventDefault(); e.returnValue=''; }
    }
    window.addEventListener('beforeunload', onUnload);
    return ()=>{ document.removeEventListener('mouseout', onMouseOut); clearTimeout(idle);
      window.removeEventListener('pointerdown', reset); window.removeEventListener('keydown', reset);
      window.removeEventListener('beforeunload', onUnload); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[]);

  const canAdd = designStatus===t.ready && !qtyErr && !!scentCode;

  const block = (idx:number, node:ReactNode) => (
    <div className={`cfg__block${step===idx?' is-current':''}`} data-step={idx}>{node}</div>
  );

  return (
    <section className="section cfg">
      <div className="container">
        {recover && (
          <div className="cfg-recover" role="dialog" aria-label={T.recoverTitle}>
            <div><b>{T.recoverTitle}</b><p className="muted" style={{marginTop:'.15rem'}}>{T.recoverBody}</p></div>
            <div className="cfg-recover__row">
              <button type="button" className="btn btn--primary btn--sm" onClick={continueDraft}>{T.recoverContinue}</button>
              <button type="button" className="btn btn--ghost btn--sm" onClick={resetDraft}>{T.recoverReset}</button>
            </div>
          </div>
        )}
        <div className="cfg-progress" aria-hidden="false">
          <span>{t.step} {step+1} {t.of} {Y} · {STEP_NAMES[locale][step] ?? ''}</span>
          <div className="cfg-progress__track"><div className="cfg-progress__fill" style={{width:`${((step+1)/Y)*100}%`}}/></div>
        </div>
        <p className="cfg-autosave" role="status">{T.autosave}</p>
        <div className="cfg__grid">
          <div className="cfg__panel">
            {block(0, <><div className="cfg__legend">{t.collection}</div>
              <div className="tilegrid tilegrid--4">
                {collections.map(c=>(
                  <button key={c.collectionCode} type="button" className="tile" aria-pressed={c.collectionCode===collectionCode}
                    onClick={()=>setCollectionCode(c.collectionCode)}>
                    <b>{c.collectionName}</b><small>{formatMoney(c.basePriceCents,'EUR',locale)}</small>
                  </button>))}
              </div></>)}

            {block(1, <><div className="cfg__legend">{t.qty}</div>
              <div className="qtygrid">
                {quickQtys.map(n=>(
                  <button key={n} type="button" className="qbtn" aria-pressed={quantity===n && !qtyText}
                    onClick={()=>selectQuick(n)}>{formatQty(n,locale)}</button>))}
              </div>
              <div className="field" style={{marginTop:'.75rem',maxWidth:260}}>
                <label htmlFor="qty-other">{t.qtyOther}</label>
                <input id="qty-other" className="input" inputMode="numeric" placeholder="z. B. 3.000"
                  value={qtyText} onChange={e=>applyQtyText(e.target.value)}/>
              </div>
              {qtyErr && <p className="cfg-error" role="alert">{quantityMessage(qtyErr,locale,qtyRules)}</p>}
              {!qtyErr && (
                <div className="tierbox">
                  {/* §INTRO-250-500 the intro entries (250/500) are fixed entry prices, not a per-1.000
                      volume rate — showing "716,00 € / 1.000" for 250 pieces would mislead. For intro
                      quantities we label the row instead; the Total row below states the real price. */}
                  <div className="tierbox__row"><span>{formatQty(quantity,locale)} {t.pieces}</span>
                    {(quantity===250||quantity===500)
                      ? <b>{locale==='de'?'Einführungspreis':locale==='en'?'Intro price':'Prix découverte'}</b>
                      : <b>{formatMoney(unitRateCents,'EUR',locale)} / 1.000</b>}</div>
                  <div className="tierbox__row tierbox__total"><span>{locale==='de'?'Gesamt':locale==='en'?'Total':'Total'}</span><b>{formatMoney(total,'EUR',locale)}</b></div>
                  {savingsCents>0 && <div className="tierbox__save">{locale==='de'?'Sie sparen':locale==='en'?'You save':'Vous économisez'} {formatMoney(savingsCents,'EUR',locale)}</div>}
                  {freeSample && <div className="tierbox__sample">🎁 {locale==='de'?`40 Düfte Musterpaket kostenlos inklusive · Wert: ${sampleValueEur} €`:locale==='en'?`Free 40-fragrance sample set included · Value: €${sampleValueEur}`:`Coffret 40 parfums offert · Valeur : ${sampleValueEur} €`}</div>}
                  <p className="muted" style={{ fontSize:'.78rem', marginTop:'.4rem' }}>{t.finalPriceNote}</p>
                </div>
              )}</>)}

            {block(2, <><div className="cfg__legend">{t.scent}</div>
              <div className="chips" role="group" aria-label={t.scent} style={{marginBottom:'.75rem'}}>
                <button type="button" className="chip" aria-pressed={scentCat==='all'} onClick={()=>setScentCat('all')}>{t.all}</button>
                {CATS.map(c=> available.some(s=>s.category===c) &&
                  <button key={c} type="button" className="chip" aria-pressed={scentCat===c} onClick={()=>setScentCat(c)}>{catLabel[locale][c]}</button>)}
              </div>
              <div className="scentsel" role="radiogroup" aria-label={t.chooseScent}>
                {shownScents.map(s=>(
                  <button key={s.code} type="button" role="radio" aria-checked={scentCode===s.code} className="tile"
                    onClick={()=>setScentCode(s.code)}>
                    <span className="scent-cat">{catLabel[locale][s.category]}</span>
                    <b>{s.name}</b><small>{s.description}</small>
                  </button>))}
              </div>
              {/* optional FREE second scent */}
              <div className="cfg-second">
                {!showSecond ? (
                  <button type="button" className="cfg-second__add" onClick={()=>setShowSecond(true)} disabled={!scentCode}>
                    {L2[locale].add}
                    <span className="cfg-second__free">{L2[locale].noSurcharge}</span>
                  </button>
                ) : (
                  <div className="cfg-second__panel">
                    <div className="cfg-second__head">
                      <strong>{L2[locale].d2} · <span className="cfg-second__tag">{L2[locale].free}</span></strong>
                      <button type="button" className="linkbtn" onClick={()=>{ setShowSecond(false); setScentCode2(null); }}>{L2[locale].remove}</button>
                    </div>
                    <p className="muted" style={{ margin:'0 0 .5rem', fontSize:'.85rem' }}>{L2[locale].hint}</p>
                    <div className="scentsel" role="radiogroup" aria-label={L2[locale].choose2}>
                      {available.filter(s=>s.code!==scentCode).map(s=>(
                        <button key={s.code} type="button" role="radio" aria-checked={scentCode2===s.code} className="tile"
                          onClick={()=>setScentCode2(s.code===scentCode2 ? null : s.code)}>
                          <span className="scent-cat">{catLabel[locale][s.category]}</span>
                          <b>{s.name}</b><small>{s.description}</small>
                        </button>))}
                    </div>
                  </div>
                )}
              </div></>)}

            {block(3, <><div className="cfg__legend">{t.intensity}</div>
              <div className="tilegrid">
                <button type="button" className="tile" aria-pressed={intensity==='normal'} onClick={()=>setIntensity('normal')}>
                  <b>{t.normal}</b><small>+0,00 €</small></button>
                <button type="button" className="tile" aria-pressed={intensity==='intense'} onClick={()=>setIntensity('intense')}>
                  <b>{t.intense}</b><small>+{formatMoney(colIntenseCents,'EUR',locale)} / 1.000</small></button>
              </div></>)}

            {block(4, <><div className="cfg__legend">{t.shape}</div>
              <div className="shapegrid">
                {SHAPES.map(s=>(
                  <button key={s.id} type="button" className={`shape${s.deferred?' shape--deferred':''}`} aria-pressed={shape===s.id}
                    onClick={()=>setShape(s.id)} title={SHAPE_L[s.id][locale]}>
                    <svg viewBox="0 0 100 120" aria-hidden="true">
                      {s.deferred ? <rect x="10" y="10" width="80" height="100" rx="10" className="sw" strokeDasharray="6 5"/>
                        : <g className="sw">{shapeGeometry(s.id)}</g>}
                    </svg>
                    <small>{SHAPE_L[s.id][locale]}</small>
                  </button>))}
              </div>
              {isDeferred(shape) && <p className="deferred-note">{t.deferredNote}</p>}</>)}

            {block(5, <><div className="cfg__legend">{t.front}</div>
              <div className="dmode" role="radiogroup" aria-label={DM[locale].title}>
                <button type="button" role="radio" aria-checked={designMode==='bugo_creates'} className={`dmode__opt${designMode==='bugo_creates'?' is-on':''}`} onClick={()=>setDesignMode('bugo_creates')}>
                  <b>{DM[locale].bugo}</b><small>{DM[locale].bugoHint}</small>
                </button>
                <button type="button" role="radio" aria-checked={designMode==='ready_file'} className={`dmode__opt${designMode==='ready_file'?' is-on':''}`} onClick={()=>setDesignMode('ready_file')}>
                  <b>{DM[locale].ready}</b><small>{DM[locale].readyHint}</small>
                </button>
              </div>
              <p className="cfg__note">{designMode==='ready_file'?DM[locale].readyNote:DM[locale].bugoNote}</p>
              <Upload id="up-front" label={designMode==='ready_file'?DM[locale].uploadReady:t.uploadFront} value={front} onChange={chooseFront} locale={locale}/>
              <div className="field" style={{marginTop:'.75rem'}}>
                <label htmlFor="fn">{t.frontNotes} · {t.designTeam}</label>
                <textarea id="fn" className="textarea" rows={3} placeholder={t.ph} value={frontNotes} onChange={e=>setFrontNotes(e.target.value)}/>
              </div>
              <div className="cfg__note">{t.cord}</div></>)}

            {block(6, <><div className="cfg__legend">{t.back}</div>
              <label className="tile" style={{flexDirection:'row',alignItems:'center',gap:'.6rem',cursor:'pointer'}} aria-pressed={sameBack}>
                <input type="checkbox" checked={sameBack} onChange={e=>setSameBack(e.target.checked)}/>
                <b style={{fontWeight:500}}>{t.identical}</b>
              </label>
              {!sameBack && <div style={{marginTop:'.75rem'}}>
                <Upload id="up-back" label={t.uploadBack} value={back} onChange={chooseBack} locale={locale}/>
                <div className="field" style={{marginTop:'.75rem'}}>
                  <label htmlFor="bn">{t.backNotes}</label>
                  <textarea id="bn" className="textarea" rows={3} placeholder={t.ph} value={backNotes} onChange={e=>setBackNotes(e.target.value)}/>
                </div>
              </div>}
              <div style={{marginTop:'.75rem'}}>
                <div className="cfg__legend">{t.supporting}</div>
                <Upload id="up-sup" label={t.supporting} multiple onAdd={addSupporting} locale={locale}/>
                {supporting.map((f,i)=>(<div key={i} style={{marginTop:'.4rem'}}>
                  <Upload id={`sup-${i}`} label="" value={f} onChange={()=>removeSupporting(i)} locale={locale}/></div>))}
              </div></>)}

            {block(7, <><div className="cfg__legend">{t.review}</div>
              <Summary locale={locale} t={t} colName={col?.collectionName} quantity={quantity}
                scentName={scentName} scentName2={scentName2} intensity={intensity} shapeLabel={shapeLabel}
                front={front} sameBack={sameBack} back={back} designStatus={designStatus}
                base={base} total={total} onEdit={setStep} inline/>
              <button type="button" className="btn btn--primary btn--lg" style={{marginTop:'var(--s-5)'}}
                disabled={adding || !canAdd} aria-busy={adding} onClick={addToCart}>
                {adding ? T.preparing : T.addToCart}</button>
              {stepError && <p className="cfg-error" role="alert" style={{marginTop:'var(--s-4)'}}>{stepError}</p>}
            </>)}
          </div>

          <aside className="preview" aria-label="Vorschau">
            <div className="preview__tags">
              <div className="ptag"><span className="ptag__cord"/><div className="ptag__stage"><ShapePreview shape={shape} artwork={front} yourLogo={t.yourLogo} locale={locale}/></div><span className="ptag__label">{t.front}</span></div>
              <div className="ptag"><span className="ptag__cord"/><div className="ptag__stage"><ShapePreview shape={shape} artwork={backArtwork} yourLogo={t.yourLogo} locale={locale}/></div><span className="ptag__label">{t.back}{sameBack?` · ${t.identicalShort}`:''}</span></div>
            </div>
            <p className="preview__note">{t.previewNote}</p>
            <p className="cfg-autosave cfg-autosave--aside">{T.autosave}</p>
            <Summary locale={locale} t={t} colName={col?.collectionName} quantity={quantity}
              scentName={scentName} scentName2={scentName2} intensity={intensity} shapeLabel={shapeLabel}
              front={front} sameBack={sameBack} back={back} designStatus={designStatus}
              base={base} total={total} onEdit={setStep}/>
            <button type="button" className="btn btn--primary btn--block" style={{marginTop:'var(--s-4)'}}
              disabled={adding || !canAdd} aria-busy={adding} onClick={addToCart}>
              {adding ? T.preparing : T.addToCart}</button>
          </aside>
        </div>
      </div>

      {/* mobile contextual action bar */}
      <div className="cfg__mobilebar-wrap">
        {stepError && <p className="cfg-error cfg-error--bar" role="alert">{stepError}</p>}
        <div className="cfg__mobilebar">
          {step>0 ? <button type="button" className="btn btn--ghost" onClick={()=>setStep(s=>Math.max(0,s-1))}>{t.prev}</button> : <span/>}
          <span className="price">{formatMoney(total,'EUR',locale)}</span>
          {step<7
            ? <button type="button" className="btn btn--primary" onClick={next}>{t.next} →</button>
            : <button type="button" className="btn btn--primary" disabled={adding || !canAdd} aria-busy={adding} onClick={addToCart}>{adding ? T.preparing : T.addToCart}</button>}
        </div>
      </div>

      {exitOpen && (
        <div className="sfmodal is-open" aria-hidden="false">
          <div className="sfmodal__scrim" onClick={()=>setExitOpen(false)} />
          <div className="sfmodal__panel exit" role="dialog" aria-modal="true" aria-label={T.exitTitle}>
            <button className="sficon exit__close" aria-label={T.close} onClick={()=>setExitOpen(false)}>×</button>
            <h3>{T.exitTitle}</h3>
            <p className="muted">{T.exitBody}</p>
            <div className="exit__actions">
              <button className="btn btn--primary btn--block" onClick={()=>setExitOpen(false)}>{T.exitContinue}</button>
              <button className="btn btn--ghost btn--block" disabled={!canAdd} onClick={addToCart}>{T.exitSave}</button>
              <a className="btn btn--ghost btn--block" href={`https://wa.me/${waDesign}`} target="_blank" rel="noopener noreferrer">{T.exitDesign}</a>
              <a className="btn btn--ghost btn--block" href={`https://wa.me/${waSupport}`} target="_blank" rel="noopener noreferrer">{T.exitSupport}</a>
              <a className="btn btn--ghost btn--block" href={`mailto:${supportEmail}`}>{supportEmail}</a>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

function Summary({ locale,t,colName,quantity,scentName,scentName2,intensity,shapeLabel,front,sameBack,back,designStatus,base,total,onEdit,inline }:any){
  const row=(k:string,v:ReactNode,step?:number)=>(<><dt>{k}</dt><dd>{v}{step!=null&&onEdit&&<button type="button" onClick={()=>onEdit(step)} style={{marginLeft:'.4rem',color:'var(--accent)',background:'none',border:0,cursor:'pointer',fontSize:'.78rem'}}>{t.edit}</button>}</dd></>);
  return (
    <div className="summary">
      <h3>{inline?t.review:'Zusammenfassung'}</h3>
      <dl>
        {row(t.collection, colName, 0)}
        {row(t.qty, `${formatQty(quantity,locale)} ${t.pieces}`, 1)}
        {row(t.scent, scentName ?? '—', 2)}
        {scentName2 && row(L2[locale as Locale].d2+" ("+L2[locale as Locale].free+")", scentName2, 2)}
        {row(t.intensity, intensity==='intense'?t.intense:t.normal, 3)}
        {row(t.shape, shapeLabel, 4)}
        {row(t.front, front?front.name:'—', 5)}
        {row(t.back, sameBack?t.identicalShort:(back?back.name:'—'), 6)}
        {row(t.designStatus, designStatus)}
      </dl>
      <div className="summary__total"><span className="muted">{t.price}</span><span className="price">{formatMoney(total,'EUR',locale)}</span></div>
    </div>
  );
}
