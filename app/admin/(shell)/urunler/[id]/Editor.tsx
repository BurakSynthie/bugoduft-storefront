'use client';
import { useState } from 'react';
import type { EditableProduct, ProductTr, MediaRef } from '@/repositories/admin-product';
import type { MediaRecord, MediaType } from '@/lib/media/types';
import { locales, type Locale } from '@/i18n/config';
import MoneyInput from '@/components/admin/MoneyInput';
import MediaPicker from '@/components/admin/MediaPicker';
import { saveProductAction } from './actions';

const TABS: { id: Locale; label: string }[] = [
  { id:'de', label:'Almanca (kaynak)' }, { id:'en', label:'İngilizce' }, { id:'fr', label:'Fransızca' },
];
type Save = 'idle' | 'saving' | 'saved' | 'error';
type PickTarget = { kind: 'cover' | 'video' | 'poster' | 'gallery'; type: MediaType };
const toRef = (m: MediaRecord): MediaRef => ({ id: m.id, url: m.url, type: m.mediaType });

export default function Editor({ initial, configured }: { initial: EditableProduct; configured: boolean }) {
  const [p, setP] = useState<EditableProduct>(initial);
  const [tab, setTab] = useState<Locale>('de');
  const [save, setSave] = useState<Save>('idle');
  const [msg, setMsg] = useState<string | null>(null);
  const [pick, setPick] = useState<PickTarget | null>(null);
  const t = p.tr[tab];

  const dirty = () => JSON.stringify(p) !== JSON.stringify(initial);
  const setTr = (patch: Partial<ProductTr>) => setP(s => ({ ...s, tr: { ...s.tr, [tab]: { ...s.tr[tab], ...patch } } }));

  function onPicked(m: MediaRecord) {
    if (!pick) return;
    const ref = toRef(m);
    setP(s => pick.kind === 'cover' ? { ...s, cover: ref }
      : pick.kind === 'video' ? { ...s, video: ref }
      : pick.kind === 'poster' ? { ...s, poster: ref }
      : { ...s, gallery: [...s.gallery, ref] });
  }
  const moveGallery = (i: number, d: -1 | 1) => setP(s => {
    const g = [...s.gallery]; const j = i + d; if (j < 0 || j >= g.length) return s;
    [g[i], g[j]] = [g[j], g[i]]; return { ...s, gallery: g };
  });

  async function onSave() {
    setSave('saving'); setMsg(null);
    const res = await saveProductAction({
      productCode: p.productCode, isActive: p.isActive, sortOrder: p.sortOrder,
      basePriceCents: p.basePriceCents, minQty: p.minQty, qtyStep: p.qtyStep, maxQty: p.maxQty,
      compareAtCents: p.compareAtCents, promoEnabled: p.promoEnabled, promoStart: p.promoStart, promoEnd: p.promoEnd,
      coverId: p.cover?.id ?? null, videoId: p.video?.id ?? null, posterId: p.poster?.id ?? null,
      galleryIds: p.gallery.map(g => g.id), tiers: p.tiers, tr: p.tr,
    });
    if (res.ok) { setSave('saved'); setTimeout(() => setSave('idle'), 2500); }
    else { setSave('error'); setMsg(res.message); }
  }

  const num = (v: string) => { const n = parseInt(v.replace(/\D/g, ''), 10); return Number.isFinite(n) ? n : 0; };

  return (
    <>
      <div className="adm__top">
        <div><h1>{p.tr.de.name || p.productCode}</h1>
          <div className="adm__crumb">Katalog / Ürünler / {p.productCode}</div></div>
        <div style={{ display:'flex', gap:'.5rem', alignItems:'center' }}>
          {save==='saved' && <span className="adm-tag">Kaydedildi ✓</span>}
          {save==='error' && <span className="adm-tag adm-tag--off">Hata</span>}
          <button className="adm-btn adm-btn--primary" disabled={!configured || save==='saving'} onClick={onSave}>
            {save==='saving' ? 'Kaydediliyor…' : 'Kaydet'}
          </button>
        </div>
      </div>

      {!configured && <div className="adm-note" style={{ marginBottom:'var(--s-5)' }}><span>ⓘ</span>
        <span>Supabase yapılandırılmadığı için kaydetme devre dışı. Bağlandığında etkinleşir.</span></div>}
      {save==='error' && msg && <div className="adm-note" style={{ marginBottom:'var(--s-5)', background:'#FEECEC', borderColor:'#F5C2C2', color:'#B42318' }}><span>⚠</span><span>{msg}</span></div>}

      {/* base attributes */}
      <div className="adm-panel">
        <strong>Temel bilgiler (dilden bağımsız)</strong>
        <div className="adm-grid2" style={{ marginTop:'var(--s-4)' }}>
          <div className="field"><label>Ürün kodu</label><input className="input" value={p.productCode} readOnly /></div>
          <div className="field"><label>Koleksiyon</label><input className="input" value={p.collectionCode} readOnly /></div>
          <div className="field"><label htmlFor="bp">Başlangıç fiyatı</label>
            <MoneyInput id="bp" cents={p.basePriceCents} onCents={c => setP(s => ({ ...s, basePriceCents: c ?? 0 }))} /></div>
          <div className="field"><label>Para birimi</label><input className="input" value={p.currency} readOnly /></div>
          <div className="field"><label>Min. adet</label><input className="input" inputMode="numeric" value={p.minQty} onChange={e=>setP(s=>({...s,minQty:num(e.target.value)}))} /></div>
          <div className="field"><label>Adım</label><input className="input" inputMode="numeric" value={p.qtyStep} onChange={e=>setP(s=>({...s,qtyStep:num(e.target.value)}))} /></div>
          <div className="field"><label>Max. adet</label><input className="input" inputMode="numeric" value={p.maxQty} onChange={e=>setP(s=>({...s,maxQty:num(e.target.value)}))} /></div>
          <div className="field"><label>Sıra</label><input className="input" inputMode="numeric" value={p.sortOrder} onChange={e=>setP(s=>({...s,sortOrder:num(e.target.value)}))} /></div>
        </div>
        <label style={{ display:'inline-flex', gap:'.5rem', alignItems:'center', marginTop:'var(--s-3)' }}>
          <input type="checkbox" checked={p.isActive} onChange={e=>setP(s=>({...s,isActive:e.target.checked}))} /> Yayında
        </label>
      </div>

      {/* media */}
      <div className="adm-panel">
        <strong>Medya</strong>
        <div className="adm-grid2" style={{ marginTop:'var(--s-4)' }}>
          <MediaSlot label="Kapak görseli" ref_={p.cover} onPick={()=>setPick({kind:'cover',type:'image'})} onClear={()=>setP(s=>({...s,cover:null}))} />
          <MediaSlot label="Ürün videosu" ref_={p.video} onPick={()=>setPick({kind:'video',type:'video'})} onClear={()=>setP(s=>({...s,video:null}))} />
          <MediaSlot label="Video posteri" ref_={p.poster} onPick={()=>setPick({kind:'poster',type:'image'})} onClear={()=>setP(s=>({...s,poster:null}))} />
        </div>
        <div style={{ marginTop:'var(--s-4)' }}>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
            <strong style={{ fontSize:'.9rem' }}>Galeri</strong>
            <button className="adm-btn adm-btn--ghost" onClick={()=>setPick({kind:'gallery',type:'image'})}>+ Görsel ekle</button>
          </div>
          {p.gallery.length === 0 ? <p className="muted" style={{ fontSize:'.85rem', marginTop:'.4rem' }}>Galeri boş.</p> :
            <div className="media-grid" style={{ marginTop:'var(--s-3)' }}>
              {p.gallery.map((g, i) => (
                <div className="media-card" key={g.id + i}>
                  <div className="media-card__thumb"><img src={g.url} alt="" /></div>
                  <div style={{ display:'flex', justifyContent:'space-between', padding:'.35rem .5rem', gap:'.3rem' }}>
                    <span style={{ display:'flex', gap:'.25rem' }}>
                      <button className="linkbtn" onClick={()=>moveGallery(i,-1)} aria-label="Yukarı">↑</button>
                      <button className="linkbtn" onClick={()=>moveGallery(i,1)} aria-label="Aşağı">↓</button>
                    </span>
                    <button className="linkbtn" style={{ color:'#B42318' }} onClick={()=>setP(s=>({...s,gallery:s.gallery.filter((_,j)=>j!==i)}))}>Kaldır</button>
                  </div>
                </div>
              ))}
            </div>}
        </div>
      </div>

      {/* Staffelpreise (quantity tiers) */}
      <div className="adm-panel">
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
          <strong>Staffelpreise (Menge → €/1.000)</strong>
          <button className="adm-btn adm-btn--ghost" onClick={()=>setP(s=>({...s, tiers:[...s.tiers, { minQty:0, ratePer1000Cents:s.basePriceCents, badgeDe:'', badgeEn:'', badgeFr:'', isActive:true }]}))}>+ Kademe</button>
        </div>
        <p className="muted" style={{ fontSize:'.82rem', margin:'.3rem 0 var(--s-3)' }}>Her ürün bağımsızdır. Fiyat 1.000 adet başınadır; toplam = oran × (adet/1.000). Özel adet en yakın alt kademeye yuvarlanır.</p>
        {p.tiers.length===0 ? <p className="muted">Kademe yok (temel fiyat kullanılır).</p> :
          <div style={{ display:'grid', gap:'.5rem' }}>
            {[...p.tiers].map((tt, i) => (
              <div key={i} className="adm-grid2" style={{ alignItems:'end', gridTemplateColumns:'1fr 1fr auto auto', gap:'.5rem' }}>
                <div className="field" style={{ margin:0 }}><label>Min. adet</label><input className="input" inputMode="numeric" value={tt.minQty} onChange={e=>setP(s=>({...s, tiers:s.tiers.map((x,j)=>j===i?{...x,minQty:num(e.target.value)}:x)}))} /></div>
                <div className="field" style={{ margin:0 }}><label>€ / 1.000</label><MoneyInput cents={tt.ratePer1000Cents} onCents={c=>setP(s=>({...s, tiers:s.tiers.map((x,j)=>j===i?{...x,ratePer1000Cents:c ?? 0}:x)}))} /></div>
                <div className="field" style={{ margin:0 }}><label>Toplam örn.</label><input className="input" readOnly value={`${((tt.ratePer1000Cents*(tt.minQty||0)/1000)/100).toFixed(0)} €`} /></div>
                <button className="linkbtn" style={{ color:'#B42318' }} onClick={()=>setP(s=>({...s, tiers:s.tiers.filter((_,j)=>j!==i)}))}>Sil</button>
              </div>
            ))}
          </div>}
      </div>

      {/* promotional / compare-at pricing (display only) */}
      <div className="adm-panel">
        <strong>Promosyon / referans fiyat (yalnızca gösterim)</strong>
        <div className="adm-note" style={{ margin:'var(--s-3) 0' }}><span>ⓘ</span>
          <span>Referans fiyat üstü çizili gösterilir; <b>ödeme fiyatını etkilemez</b>. Almanya PAngV §11 gereği,
            girdiğiniz referans fiyat yasal olarak geçerli olmalıdır (genellikle önceki 30 gün içindeki en düşük fiyat).
            Yapay/yanıltıcı indirim girmeyin.</span></div>
        <label style={{ display:'inline-flex', gap:'.5rem', alignItems:'center', marginBottom:'var(--s-3)' }}>
          <input type="checkbox" checked={p.promoEnabled} onChange={e=>setP(s=>({...s,promoEnabled:e.target.checked}))} /> Promosyon etkin
        </label>
        <div className="adm-grid2">
          <div className="field"><label htmlFor="cmp">Referans (eski) fiyat</label>
            <MoneyInput id="cmp" cents={p.compareAtCents ?? 0} onCents={c => setP(s => ({ ...s, compareAtCents: c && c>0 ? c : null }))} /></div>
          <div className="field"><label>Güncel satış fiyatı</label><input className="input" value={(p.basePriceCents/100).toFixed(2)+' '+p.currency} readOnly /></div>
          <div className="field"><label>Kampanya başlangıcı (ops.)</label><input className="input" type="date" value={p.promoStart? p.promoStart.slice(0,10):''} onChange={e=>setP(s=>({...s,promoStart:e.target.value? new Date(e.target.value).toISOString():null}))} /></div>
          <div className="field"><label>Kampanya bitişi (ops.)</label><input className="input" type="date" value={p.promoEnd? p.promoEnd.slice(0,10):''} onChange={e=>setP(s=>({...s,promoEnd:e.target.value? new Date(e.target.value).toISOString():null}))} /></div>
        </div>
      </div>

      {/* per-language content */}
      <div className="adm-panel">
        <div className="adm-tabs" role="tablist">
          {TABS.map(tb => <button key={tb.id} role="tab" aria-selected={tab===tb.id} className="adm-tab" onClick={()=>setTab(tb.id)}>{tb.label}</button>)}
        </div>
        <div role="tabpanel">
          <div className="adm-grid2">
            <div className="field"><label>Ürün adı ({tab.toUpperCase()})</label><input className="input" value={t.name} onChange={e=>setTr({name:e.target.value})} /></div>
            <div className="field"><label>URL slug ({tab.toUpperCase()})</label><input className="input" value={t.slug} onChange={e=>setTr({slug:e.target.value})} /></div>
          </div>
          <div className="field"><label>H1</label><input className="input" value={t.h1} onChange={e=>setTr({h1:e.target.value})} /></div>
          <div className="field"><label>Kısa açıklama</label><textarea className="textarea" rows={2} value={t.shortDesc} onChange={e=>setTr({shortDesc:e.target.value})} /></div>
          <div className="field"><label>Uzun açıklama</label><textarea className="textarea" rows={4} value={t.longDesc} onChange={e=>setTr({longDesc:e.target.value})} /></div>
          <div className="field"><label>Özellikler (her satır bir madde)</label>
            <textarea className="textarea" rows={3} value={t.features.join('\n')} onChange={e=>setTr({features:e.target.value.split('\n').map(x=>x.trim()).filter(Boolean)})} /></div>
          <div className="adm-grid2">
            <div className="field"><label>Kullanım alanı</label><textarea className="textarea" rows={2} value={t.useCase} onChange={e=>setTr({useCase:e.target.value})} /></div>
            <div className="field"><label>Rozet (badge)</label><input className="input" value={t.badge} onChange={e=>setTr({badge:e.target.value})} /></div>
            <div className="field"><label>Kampanya rozeti (ops.)</label><input className="input" value={t.promoBadge} onChange={e=>setTr({promoBadge:e.target.value})} /></div>
            <div className="field"><label>Üretim bilgisi</label><textarea className="textarea" rows={2} value={t.productionInfo} onChange={e=>setTr({productionInfo:e.target.value})} /></div>
            <div className="field"><label>Teslimat bilgisi</label><textarea className="textarea" rows={2} value={t.deliveryInfo} onChange={e=>setTr({deliveryInfo:e.target.value})} /></div>
            <div className="field"><label>MOQ metni</label><input className="input" value={t.moqText} onChange={e=>setTr({moqText:e.target.value})} /></div>
          </div>
          <div style={{ borderTop:'1px solid var(--border)', margin:'var(--s-4) 0', paddingTop:'var(--s-4)' }}><strong style={{ fontSize:'.9rem' }}>SEO ({tab.toUpperCase()})</strong></div>
          <div className="field"><label>SEO başlığı</label><input className="input" value={t.seoTitle} onChange={e=>setTr({seoTitle:e.target.value})} /></div>
          <div className="field"><label>SEO açıklaması</label><textarea className="textarea" rows={2} value={t.seoDescription} onChange={e=>setTr({seoDescription:e.target.value})} /></div>
          <p className="muted" style={{ fontSize:'.82rem' }}>Her dil ayrı satır olarak saklanır. Canonical/hreflang bu slug’lardan üretilir.</p>
        </div>
      </div>

      {pick && <MediaPicker type={pick.type} onSelect={onPicked} onClose={()=>setPick(null)} />}
    </>
  );
}

function MediaSlot({ label, ref_, onPick, onClear }:{ label:string; ref_:MediaRef|null; onPick:()=>void; onClear:()=>void }) {
  return (
    <div className="field">
      <label>{label}</label>
      {ref_ ? (
        <div className="media-slot">
          {ref_.type === 'image' ? <img src={ref_.url} alt="" /> : <video src={ref_.url} muted preload="none" />}
          <div className="media-slot__act">
            <button className="linkbtn" onClick={onPick}>Değiştir</button>
            <button className="linkbtn" style={{ color:'#B42318' }} onClick={onClear}>Kaldır</button>
          </div>
        </div>
      ) : <button className="adm-btn adm-btn--ghost" onClick={onPick}>Seç / Yükle</button>}
    </div>
  );
}
