'use client';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import { beginCheckout, finalizeCheckout } from '@/app/actions/checkout';
import type { Locale } from '@/i18n/config';
import { formatMoney, formatQty } from '@/lib/money';
import { validateQuantity, quantityMessage } from '@/lib/quantity';
import { totalCents } from '@/lib/configurator/pricing';
import type { ArtworkRef, BugoConfiguration, Intensity, ShapeId } from '@/lib/configurator/types';
import { SHAPES, isDeferred, shapeGeometry } from '@/lib/configurator/shapes';
import Upload from './Upload';

export type CfgCollection = { collectionCode:string; collectionName:string; productId:string; basePriceCents:number; scentCodes:string[] };
export type CfgScent = { code:string; category:string; name:string; description:string };

const QUICK = [1000,2000,5000,10000,25000,50000,100000];
const CATS = ['frisch','fruchtig','suess','elegant','intensiv'] as const;

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
    yourLogo:'Ihr Logo', step:'Schritt', of:'von', chooseScent:'Duft auswählen', all:'Alle',
    surchargeHint:'einmalig +30,00 € pro Konfiguration', done:'Konfiguration bereit',
    doneNote:'Ihre Konfiguration ist vollständig und für den nächsten Schritt vorbereitet.', edit:'Bearbeiten',
    cord:'Kordel: Schwarz (fest)', checkout:'Zur Kasse', loading:'Wird vorbereitet…', checkoutErr:'Die Konfiguration konnte nicht für den Checkout vorbereitet werden. Bitte versuchen Sie es erneut.' },
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
    yourLogo:'Your logo', step:'Step', of:'of', chooseScent:'Choose a scent', all:'All',
    surchargeHint:'one-time +€30.00 per configuration', done:'Configuration ready',
    doneNote:'Your configuration is complete and prepared for the next step.', edit:'Edit',
    cord:'Cord: black (fixed)', checkout:'Checkout', loading:'Preparing…', checkoutErr:'The configuration could not be prepared for checkout. Please try again.' },
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
    yourLogo:'Votre logo', step:'Étape', of:'sur', chooseScent:'Choisir un parfum', all:'Tous',
    surchargeHint:'+30,00 € une seule fois par configuration', done:'Configuration prête',
    doneNote:'Votre configuration est complète et préparée pour l’étape suivante.', edit:'Modifier',
    cord:'Cordon : noir (fixe)', checkout:'Passer à la caisse', loading:'Préparation…', checkoutErr:'La configuration n’a pas pu être préparée pour le paiement. Veuillez réessayer.' },
} as const;

const catLabel: Record<Locale,Record<string,string>> = {
  de:{frisch:'Frisch',fruchtig:'Fruchtig',suess:'Süß',elegant:'Elegant',intensiv:'Intensiv'},
  en:{frisch:'Fresh',fruchtig:'Fruity',suess:'Sweet',elegant:'Elegant',intensiv:'Intense'},
  fr:{frisch:'Frais',fruchtig:'Fruité',suess:'Sucré',elegant:'Élégant',intensiv:'Intense'},
};

function ShapePreview({ shape, artwork, yourLogo }:{ shape:ShapeId; artwork:ArtworkRef|null; yourLogo:string }) {
  const geo = shapeGeometry(shape);
  const cid = `clip-${shape}-${Math.random().toString(36).slice(2,7)}`;
  if (!geo) { // deferred: neutral state, no faked contour
    return (<svg viewBox="0 0 100 120" role="img" aria-label="Form wird vom Designteam vorbereitet">
      <rect x="6" y="6" width="88" height="108" rx="10" fill="#EEF3FA" stroke="#B4690E" strokeDasharray="4 4" strokeWidth="1.5"/>
      <text x="50" y="62" textAnchor="middle" fontSize="7" fill="#8A5A12">BUGO</text></svg>);
  }
  return (
    <svg viewBox="0 0 100 120" role="img" aria-label="Vorschau">
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

export default function Configurator({ locale, collections, scents, intenseCents, initialCollection }:
  { locale:Locale; collections:CfgCollection[]; scents:CfgScent[]; intenseCents:number; initialCollection?:string }) {
  const t = L[locale];
  const [collectionCode, setCollectionCode] = useState(initialCollection && collections.find(c=>c.collectionCode===initialCollection) ? initialCollection : collections[0]?.collectionCode);
  const col = collections.find(c=>c.collectionCode===collectionCode) ?? collections[0];

  const [quantity, setQuantity] = useState(1000);
  const [qtyText, setQtyText] = useState('');
  const [scentCode, setScentCode] = useState<string|null>(null);
  const [scentCat, setScentCat] = useState<string>('all');
  const [intensity, setIntensity] = useState<Intensity>('normal');
  const [shape, setShape] = useState<ShapeId>('rectangle');
  const [front, setFront] = useState<ArtworkRef|null>(null);
  const [frontNotes, setFrontNotes] = useState('');
  const [sameBack, setSameBack] = useState(true);
  const [back, setBack] = useState<ArtworkRef|null>(null);
  const [backNotes, setBackNotes] = useState('');
  const [supporting, setSupporting] = useState<ArtworkRef[]>([]);
  const [step, setStep] = useState(0);
  const [finished, setFinished] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [checkoutError, setCheckoutError] = useState<string|null>(null);
  const configIdRef = useRef<string>('');
  if (!configIdRef.current) configIdRef.current = (globalThis.crypto?.randomUUID?.() ?? `cfg-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  const donePathsRef = useRef<{ front?:string; back?:string; supporting:Record<number,string> }>({ supporting:{} });

  // configurator owns the mobile chrome: hide global bottom nav while active
  useEffect(()=>{ document.body.classList.add('cfg-active'); return ()=>document.body.classList.remove('cfg-active'); },[]);
  // preselect from ?k= without making the route dynamic
  useEffect(()=>{ try{ const k=new URLSearchParams(window.location.search).get('k');
    if(k && collections.find(c=>c.collectionCode===k)) setCollectionCode(k); }catch{} },[collections]);

  // scents available for the selected collection
  const available = useMemo(()=> scents.filter(s=> col?.scentCodes.includes(s.code)), [scents, col]);
  useEffect(()=>{ if(scentCode && !available.find(s=>s.code===scentCode)) setScentCode(null); },[available,scentCode]);
  const shownScents = scentCat==='all' ? available : available.filter(s=>s.category===scentCat);

  const base = col?.basePriceCents ?? 0;
  const total = totalCents(base, intensity, intenseCents);
  const qtyErr = validateQuantity(quantity, {min:1000,max:100000,step:1000});
  const backArtwork = sameBack ? front : back;

  const STEPS = ['collection','qty','scent','intensity','shape','front','back','notesReview'];
  const Y = 9; // presented as Schritt X von 9 (front/back/hinweise/prüfung counted for the customer)

  function selectQuick(n:number){ setQuantity(n); setQtyText(''); }
  function applyQtyText(v:string){ setQtyText(v); const n=parseInt(v.replace(/\D/g,''),10); if(Number.isFinite(n)) setQuantity(n); }

  function incoming() {
    return { configId: configIdRef.current, locale, collectionCode: col.collectionCode, scentCode,
      intensity, shape, quantity, frontInstructions: frontNotes, sameBackAsFront: sameBack,
      backInstructions: sameBack ? '' : backNotes };
  }
  async function startCheckout() {
    if (submitting) return;                       // double-click safety
    setCheckoutError(null); setSubmitting(true);
    try {
      const cache = donePathsRef.current;
      const fileFields: { field:string; name:string }[] = [];
      if (front?.file && !cache.front) fileFields.push({ field:'front', name: front.name });
      if (!sameBack && back?.file && !cache.back) fileFields.push({ field:'back', name: back.name });
      supporting.forEach((f,i)=>{ if (f.file && !cache.supporting[i]) fileFields.push({ field:`supporting-${i}`, name: f.name }); });

      const begun = await beginCheckout(incoming(), fileFields);
      if (!begun.ok) { setCheckoutError(begun.message); setSubmitting(false); return; }

      const paths: { frontPath?:string|null; backPath?:string|null; supporting?:{field:string;path:string}[] } = {
        frontPath: cache.front ?? null, backPath: cache.back ?? null,
        supporting: Object.entries(cache.supporting).map(([i,path])=>({ field:`supporting-${i}`, path })),
      };
      if (begun.uploads.length) {
        const sb = createSupabaseBrowserClient();
        if (!sb) { setCheckoutError(t.checkoutErr); setSubmitting(false); return; }
        for (const u of begun.uploads) {
          const file = u.field==='front' ? front?.file
            : u.field==='back' ? back?.file
            : supporting[Number(u.field.split('-')[1])]?.file;
          if (!file) continue;
          const { error } = await sb.storage.from(begun.bucket).uploadToSignedUrl(u.path, u.token, file);
          if (error) { setCheckoutError(t.checkoutErr); setSubmitting(false); return; }
          if (u.field==='front') { paths.frontPath = u.path; cache.front = u.path; }
          else if (u.field==='back') { paths.backPath = u.path; cache.back = u.path; }
          else { paths.supporting!.push({ field:u.field, path:u.path }); cache.supporting[Number(u.field.split('-')[1])] = u.path; }
        }
      }
      const fin = await finalizeCheckout(incoming(), paths);
      if (!fin.ok) { setCheckoutError(fin.message); setSubmitting(false); return; }
      window.location.href = fin.checkoutUrl;      // Shopify owns checkout
    } catch { setCheckoutError(t.checkoutErr); setSubmitting(false); }
  }

  const buildConfig = (): BugoConfiguration => ({
    productId: col.productId, collectionCode: col.collectionCode, quantity,
    scentCode, intensity, shape,
    frontArtwork: front, frontInstructions: frontNotes,
    sameBackAsFront: sameBack, backArtwork: sameBack ? null : back, backInstructions: sameBack ? '' : backNotes,
    supportingFiles: supporting, basePriceCents: base, surchargeCents: total-base, totalPriceCents: total,
    currency:'EUR', locale,
  });

  const scentName = scents.find(s=>s.code===scentCode)?.name;
  const shapeLabel = SHAPES.find(s=>s.id===shape)?.labelDe;
  const designStatus = front && frontNotes.trim() && (sameBack || (back && backNotes.trim())) ? t.ready : t.incomplete;

  // ---- blocks (desktop shows all; mobile shows current step only) ----
  const block = (idx:number, node:ReactNode) => (
    <div className={`cfg__block${step===idx?' is-current':''}`} data-step={idx}>{node}</div>
  );

  return (
    <section className="section cfg">
      <div className="container">
        <div className="cfg-progress" aria-hidden="false">
          <span>{t.step} {step+1} {t.of} {Y}</span>
          <div className="cfg-progress__track"><div className="cfg-progress__fill" style={{width:`${((step+1)/Y)*100}%`}}/></div>
        </div>
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
                {QUICK.map(n=>(
                  <button key={n} type="button" className="qbtn" aria-pressed={quantity===n && !qtyText}
                    onClick={()=>selectQuick(n)}>{formatQty(n,locale)}</button>))}
              </div>
              <div className="field" style={{marginTop:'.75rem',maxWidth:260}}>
                <label htmlFor="qty-other">{t.qtyOther}</label>
                <input id="qty-other" className="input" inputMode="numeric" placeholder="z. B. 3.000"
                  value={qtyText} onChange={e=>applyQtyText(e.target.value)}/>
              </div>
              {qtyErr && <p className="cfg-error" role="alert">{quantityMessage(qtyErr,locale)}</p>}</>)}

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
              </div></>)}

            {block(3, <><div className="cfg__legend">{t.intensity}</div>
              <div className="tilegrid">
                <button type="button" className="tile" aria-pressed={intensity==='normal'} onClick={()=>setIntensity('normal')}>
                  <b>{t.normal}</b><small>+0,00 €</small></button>
                <button type="button" className="tile" aria-pressed={intensity==='intense'} onClick={()=>setIntensity('intense')}>
                  <b>{t.intense}</b><small>{t.surchargeHint}</small></button>
              </div></>)}

            {block(4, <><div className="cfg__legend">{t.shape}</div>
              <div className="shapegrid">
                {SHAPES.map(s=>(
                  <button key={s.id} type="button" className={`shape${s.deferred?' shape--deferred':''}`} aria-pressed={shape===s.id}
                    onClick={()=>setShape(s.id)} title={s.labelDe}>
                    <svg viewBox="0 0 100 120" aria-hidden="true">
                      {s.deferred ? <rect x="10" y="10" width="80" height="100" rx="10" className="sw" strokeDasharray="6 5"/>
                        : <g className="sw">{shapeGeometry(s.id)}</g>}
                    </svg>
                    <small>{s.labelDe}</small>
                  </button>))}
              </div>
              {isDeferred(shape) && <p className="deferred-note">{t.deferredNote}</p>}</>)}

            {block(5, <><div className="cfg__legend">{t.front}</div>
              <Upload id="up-front" label={t.uploadFront} value={front} onChange={setFront}/>
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
                <Upload id="up-back" label={t.uploadBack} value={back} onChange={setBack}/>
                <div className="field" style={{marginTop:'.75rem'}}>
                  <label htmlFor="bn">{t.backNotes}</label>
                  <textarea id="bn" className="textarea" rows={3} placeholder={t.ph} value={backNotes} onChange={e=>setBackNotes(e.target.value)}/>
                </div>
              </div>}
              <div style={{marginTop:'.75rem'}}>
                <div className="cfg__legend">{t.supporting}</div>
                <Upload id="up-sup" label={t.supporting} multiple onAdd={r=>setSupporting(s=>[...s,r])}/>
                {supporting.map((f,i)=>(<div key={i} style={{marginTop:'.4rem'}}>
                  <Upload id={`sup-${i}`} label="" value={f} onChange={()=>setSupporting(s=>s.filter((_,j)=>j!==i))}/></div>))}
              </div></>)}

            {block(7, <><div className="cfg__legend">{t.review}</div>
              <Summary locale={locale} t={t} colName={col?.collectionName} quantity={quantity}
                scentName={scentName} intensity={intensity} shapeLabel={shapeLabel}
                front={front} sameBack={sameBack} back={back} designStatus={designStatus}
                base={base} total={total} onEdit={setStep} inline/>
              <button type="button" className="btn btn--primary btn--lg" style={{marginTop:'var(--s-5)'}}
                disabled={submitting || designStatus!==t.ready || !!qtyErr || !scentCode}
                aria-busy={submitting} onClick={startCheckout}>
                {submitting ? t.loading : t.checkout}</button>
              {checkoutError && <p className="cfg-error" role="alert" style={{marginTop:'var(--s-4)'}}>{checkoutError}</p>}
            </>)}
          </div>

          {/* live preview + summary (desktop sticky) */}
          <aside className="preview" aria-label="Vorschau">
            <div className="preview__tags">
              <div className="ptag"><span className="ptag__cord"/><div className="ptag__stage"><ShapePreview shape={shape} artwork={front} yourLogo={t.yourLogo}/></div><span className="ptag__label">{t.front}</span></div>
              <div className="ptag"><span className="ptag__cord"/><div className="ptag__stage"><ShapePreview shape={shape} artwork={backArtwork} yourLogo={t.yourLogo}/></div><span className="ptag__label">{t.back}{sameBack?` · ${t.identicalShort}`:''}</span></div>
            </div>
            <p className="preview__note">{t.previewNote}</p>
            <Summary locale={locale} t={t} colName={col?.collectionName} quantity={quantity}
              scentName={scentName} intensity={intensity} shapeLabel={shapeLabel}
              front={front} sameBack={sameBack} back={back} designStatus={designStatus}
              base={base} total={total} onEdit={setStep}/>
          </aside>
        </div>
      </div>

      {/* mobile contextual action bar */}
      <div className="cfg__mobilebar">
        {step>0 ? <button type="button" className="btn btn--ghost" onClick={()=>setStep(s=>Math.max(0,s-1))}>{t.prev}</button> : <span/>}
        <span className="price">{formatMoney(total,'EUR',locale)}</span>
        {step<7
          ? <button type="button" className="btn btn--primary" onClick={()=>setStep(s=>Math.min(7,s+1))}>{t.next} →</button>
          : <button type="button" className="btn btn--primary" disabled={submitting || designStatus!==t.ready || !!qtyErr || !scentCode} aria-busy={submitting} onClick={startCheckout}>{submitting ? t.loading : t.checkout}</button>}
      </div>
    </section>
  );
}

function Summary({ locale,t,colName,quantity,scentName,intensity,shapeLabel,front,sameBack,back,designStatus,base,total,onEdit,inline }:any){
  const row=(k:string,v:ReactNode,step?:number)=>(<><dt>{k}</dt><dd>{v}{step!=null&&onEdit&&<button type="button" onClick={()=>onEdit(step)} style={{marginLeft:'.4rem',color:'var(--accent)',background:'none',border:0,cursor:'pointer',fontSize:'.78rem'}}>{t.edit}</button>}</dd></>);
  return (
    <div className="summary">
      <h3>{inline?t.review:'Zusammenfassung'}</h3>
      <dl>
        {row(t.collection, colName, 0)}
        {row(t.qty, `${formatQty(quantity,locale)} ${t.pieces}`, 1)}
        {row(t.scent, scentName ?? '—', 2)}
        {row(t.intensity, intensity==='intense'?t.intense:t.normal, 3)}
        {row(t.shape, shapeLabel, 4)}
        {row(t.front, front?front.name:'—', 5)}
        {row(t.back, sameBack?t.identicalShort:(back?back.name:'—'), 6)}
        {row(t.designStatus, designStatus)}
      </dl>
      <div className="summary__total"><span className="muted">{t.price}</span><span className="price">{formatMoney(total,'EUR',locale)}</span></div>
      {total!==base && <div className="cfg__note" style={{textAlign:'right'}}>{formatMoney(base,'EUR',locale)} + {formatMoney(total-base,'EUR',locale)}</div>}
    </div>
  );
}
