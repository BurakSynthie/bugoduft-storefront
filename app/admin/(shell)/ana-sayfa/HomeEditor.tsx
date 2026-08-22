'use client';
import { useState } from 'react';
import type { Locale } from '@/i18n/config';
import { locales } from '@/i18n/config';
import type { HomeExtra } from '@/data/seed/home-content';
import { HOME_SECTIONS, SECTION_GROUPS, type HomeSections } from '@/data/seed/home-sections';
import type { MediaRecord } from '@/lib/media/types';
import MediaPicker from '@/components/admin/MediaPicker';
import { saveHomepageAction } from './actions';

const TABS: { id: Locale; label: string }[] = [
  { id:'de', label:'Almanca' }, { id:'en', label:'İngilizce' }, { id:'fr', label:'Fransızca' },
];
type Save = 'idle' | 'saving' | 'saved' | 'error';
type Pick =
  | { kind:'hero' } | { kind:'heroVideo' } | { kind:'heroPoster' } | { kind:'prodVideo'; i:number } | { kind:'prodPoster'; i:number }
  | { kind:'gallery' } | { kind:'logo' };

type LF = {
  heroEyebrow:string; heroHead:string; heroSub:string;
  shippingIncluded:string; heroChips:string[]; credibility:string[];
  production:{ title:string; body:string }[];
  support:{ gTitle:string; gWa:string; gDisp:string; sTitle:string; sWa:string; sDisp:string };
  social:{ email:string; instagram:string };
  sections: HomeSections;
  // §G launch-important, previously seed-only content now editable per locale.
  stats:{ value:string; label:string }[];
  whyBugo:{ title:string; body:string }[];
  industries:string[];
  brandImpact:{ title:string; body:string; points:string[] };
  faqGroups:{ group:string; items:{ q:string; a:string }[] }[];
  scentsHeading:{ eyebrow:string; title:string; description:string };
};

export default function HomeEditor({ initial, configured }:{ initial: Record<Locale, HomeExtra>; configured: boolean }) {
  const [shared, setShared] = useState({
    heroImage: initial.de.heroProductImage,
    heroVideo: initial.de.heroVideo ?? null,
    heroPoster: initial.de.heroPoster ?? null,
    prodMedia: initial.de.production.map(s => ({ video:s.video, poster:s.poster })),
    gallery: initial.de.gallery.map(g => ({ src:g.src, alt:g.alt })),
    logos: initial.de.referenceLogos.map(l => ({ src:l.src, alt:l.alt })),
  });
  const mkLF = (l: Locale): LF => ({
    heroEyebrow: initial[l].heroEyebrow ?? '', heroHead: initial[l].heroHead ?? '', heroSub: initial[l].heroSub ?? '',
    shippingIncluded: initial[l].shippingIncluded, heroChips: initial[l].heroChips, credibility: initial[l].credibility,
    production: initial[l].production.map(s => ({ title:s.title, body:s.body })),
    support: {
      gTitle:initial[l].support.grafik.title, gWa:initial[l].support.grafik.whatsapp, gDisp:initial[l].support.grafik.display,
      sTitle:initial[l].support.kundenservice.title, sWa:initial[l].support.kundenservice.whatsapp, sDisp:initial[l].support.kundenservice.display,
    },
    social: { email: initial[l].social.email ?? '', instagram: initial[l].social.instagram ?? '' },
    sections: { ...HOME_SECTIONS[l], ...(initial[l].sections ?? {}) },
    stats: initial[l].stats.map(s => ({ value:s.value, label:s.label })),
    whyBugo: initial[l].whyBugo.map(u => ({ title:u.title, body:u.body })),
    industries: initial[l].industries.map(i => i.name),
    brandImpact: { title:initial[l].brandImpact.title, body:initial[l].brandImpact.body, points:[...initial[l].brandImpact.points] },
    faqGroups: initial[l].faqGroups.map(g => ({ group:g.group, items:g.items.map(it => ({ q:it.q, a:it.a })) })),
    scentsHeading: {
      eyebrow: initial[l].scentsHeading?.eyebrow ?? '',
      title: initial[l].scentsHeading?.title ?? '',
      description: initial[l].scentsHeading?.description ?? '',
    },
  });
  const [byL, setByL] = useState<Record<Locale, LF>>(() =>
    Object.fromEntries(locales.map(l => [l, mkLF(l)])) as Record<Locale, LF>);
  const [tab, setTab] = useState<Locale>('de');
  const [save, setSave] = useState<Save>('idle');
  const [msg, setMsg] = useState<string | null>(null);
  const [pick, setPick] = useState<Pick | null>(null);
  const f = byL[tab];
  const setF = (patch: Partial<LF>) => setByL(s => ({ ...s, [tab]: { ...s[tab], ...patch } }));
  const lines = (v: string) => v.split('\n').map(x => x.trim()).filter(Boolean);

  function onPicked(m: MediaRecord) {
    if (!pick) return;
    if (pick.kind === 'hero') setShared(s => ({ ...s, heroImage:m.url }));
    else if (pick.kind === 'heroVideo') setShared(s => ({ ...s, heroVideo:m.url }));
    else if (pick.kind === 'heroPoster') setShared(s => ({ ...s, heroPoster:m.url }));
    else if (pick.kind === 'prodVideo') setShared(s => ({ ...s, prodMedia: s.prodMedia.map((x,i)=> i===pick.i?{...x,video:m.url}:x) }));
    else if (pick.kind === 'prodPoster') setShared(s => ({ ...s, prodMedia: s.prodMedia.map((x,i)=> i===pick.i?{...x,poster:m.url}:x) }));
    else if (pick.kind === 'gallery') setShared(s => ({ ...s, gallery:[...s.gallery, { src:m.url, alt:'' }] }));
    else if (pick.kind === 'logo') setShared(s => ({ ...s, logos:[...s.logos, { src:m.url, alt:'' }] }));
  }
  const move = <T,>(arr:T[], i:number, d:-1|1):T[] => { const a=[...arr]; const j=i+d; if(j<0||j>=a.length)return a; [a[i],a[j]]=[a[j],a[i]]; return a; };

  async function onSave() {
    setSave('saving'); setMsg(null);
    const content = Object.fromEntries(locales.map(l => {
      const b = byL[l]; const base = initial[l];
      const he: HomeExtra = {
        ...base,
        heroProductImage: shared.heroImage,
        heroEyebrow: b.heroEyebrow || undefined, heroHead: b.heroHead || undefined, heroSub: b.heroSub || undefined,
        heroVideo: shared.heroVideo, heroPoster: shared.heroPoster,
        shippingIncluded: b.shippingIncluded, heroChips: b.heroChips, credibility: b.credibility,
        production: base.production.map((s,i) => ({ ...s, title:b.production[i].title, body:b.production[i].body,
          video: shared.prodMedia[i]?.video ?? null, poster: shared.prodMedia[i]?.poster ?? null })),
        gallery: shared.gallery.map(g => ({ src:g.src, alt:g.alt, orientation:'portrait' as const })),
        referenceLogos: shared.logos.map(x => ({ src:x.src, alt:x.alt })),
        support: {
          grafik: { ...base.support.grafik, title:b.support.gTitle, whatsapp:b.support.gWa, display:b.support.gDisp },
          kundenservice: { ...base.support.kundenservice, title:b.support.sTitle, whatsapp:b.support.sWa, display:b.support.sDisp },
        },
        social: { ...base.social, email: b.social.email || undefined, instagram: b.social.instagram || undefined },
        sections: b.sections,
        // §G persist launch-important content edits (mapped back to HomeExtra shapes).
        stats: b.stats.map(s => ({ value:s.value, label:s.label })),
        whyBugo: b.whyBugo.map(u => ({ title:u.title, body:u.body })),
        industries: b.industries.map(name => ({ name })),
        brandImpact: { title:b.brandImpact.title, body:b.brandImpact.body, points:b.brandImpact.points.filter(p=>p.trim()) },
        faqGroups: b.faqGroups.map(g => ({ group:g.group, items:g.items.filter(it=>it.q.trim()||it.a.trim()) })),
        scentsHeading: (b.scentsHeading.eyebrow.trim() || b.scentsHeading.title.trim() || b.scentsHeading.description.trim())
          ? { eyebrow:b.scentsHeading.eyebrow, title:b.scentsHeading.title, description:b.scentsHeading.description }
          : undefined,
      };
      return [l, he];
    })) as Record<Locale, HomeExtra>;
    const res = await saveHomepageAction(content);
    if (res.ok) { setSave('saved'); setTimeout(()=>setSave('idle'), 2500); }
    else { setSave('error'); setMsg(res.message); }
  }

  return (
    <>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', gap:'.5rem', marginBottom:'var(--s-4)', flexWrap:'wrap' }}>
        <div className="adm-tabs" role="tablist">
          {TABS.map(t => <button key={t.id} role="tab" aria-selected={tab===t.id} className="adm-tab" onClick={()=>setTab(t.id)}>{t.label}</button>)}
        </div>
        <div style={{ display:'flex', gap:'.5rem', alignItems:'center' }}>
          {save==='saved' && <span className="adm-tag">Kaydedildi ✓</span>}
          <button className="adm-btn adm-btn--primary" disabled={!configured || save==='saving'} onClick={onSave}>{save==='saving'?'Kaydediliyor…':'Kaydet'}</button>
        </div>
      </div>
      {!configured && <div className="adm-note" style={{ marginBottom:'var(--s-4)' }}><span>ⓘ</span><span>Supabase yapılandırılmadığı için kaydetme devre dışı.</span></div>}
      {save==='error' && msg && <div className="adm-note" style={{ marginBottom:'var(--s-4)', background:'#FEECEC', borderColor:'#F5C2C2', color:'#B42318' }}><span>⚠</span><span>{msg}</span></div>}

      {/* HERO */}
      <div className="adm-panel">
        <strong>Hero</strong>
        <div className="field"><label>Üst küçük başlık ({tab.toUpperCase()})</label><input className="input" value={f.heroEyebrow} onChange={e=>setF({heroEyebrow:e.target.value})} placeholder="INDIVIDUELLE WERBEDÜFTE · MADE FOR YOUR BRAND" /></div>
        <div className="field"><label>Başlık / H1 ({tab.toUpperCase()})</label><input className="input" value={f.heroHead} onChange={e=>setF({heroHead:e.target.value})} placeholder="Individuelle Duftanhänger für Ihre Marke." /></div>
        <div className="field"><label>Alt başlık ({tab.toUpperCase()})</label><textarea className="textarea" rows={2} value={f.heroSub} onChange={e=>setF({heroSub:e.target.value})} /></div>
        <div className="adm-grid2" style={{ marginTop:'var(--s-2)' }}>
          <div className="field"><label>Kargo rozeti ({tab.toUpperCase()})</label><input className="input" value={f.shippingIncluded} onChange={e=>setF({shippingIncluded:e.target.value})} /></div>
        </div>
        <div className="field"><label>Hero çipleri — her satır bir çip ({tab.toUpperCase()})</label>
          <textarea className="textarea" rows={4} value={f.heroChips.join('\n')} onChange={e=>setF({heroChips:lines(e.target.value)})} /></div>
        <div className="field"><label>Güven ifadeleri — her satır bir madde ({tab.toUpperCase()})</label>
          <textarea className="textarea" rows={2} value={f.credibility.join('\n')} onChange={e=>setF({credibility:lines(e.target.value)})} /></div>
        <div className="field"><label>Hero ürün görseli (görsel VEYA video)</label>
          {shared.heroImage
            ? <div className="media-slot"><img src={shared.heroImage} alt="" /><div className="media-slot__act"><button className="linkbtn" onClick={()=>setPick({kind:'hero'})}>Değiştir</button><button className="linkbtn" style={{color:'#B42318'}} onClick={()=>setShared(s=>({...s,heroImage:null}))}>Kaldır</button></div></div>
            : <button className="adm-btn adm-btn--ghost" onClick={()=>setPick({kind:'hero'})}>Görsel seç / Yükle</button>}
        </div>
        <div className="adm-grid2">
          <div className="field"><label>Hero videosu (ops. · sessiz döngü)</label>
            {shared.heroVideo
              ? <div className="media-slot"><video src={shared.heroVideo} muted preload="none" /><div className="media-slot__act"><button className="linkbtn" onClick={()=>setPick({kind:'heroVideo'})}>Değiştir</button><button className="linkbtn" style={{color:'#B42318'}} onClick={()=>setShared(s=>({...s,heroVideo:null}))}>Kaldır</button></div></div>
              : <button className="adm-btn adm-btn--ghost" onClick={()=>setPick({kind:'heroVideo'})}>Video seç / Yükle</button>}
          </div>
          <div className="field"><label>Video posteri (ops.)</label>
            {shared.heroPoster
              ? <div className="media-slot"><img src={shared.heroPoster} alt="" /><div className="media-slot__act"><button className="linkbtn" onClick={()=>setPick({kind:'heroPoster'})}>Değiştir</button><button className="linkbtn" style={{color:'#B42318'}} onClick={()=>setShared(s=>({...s,heroPoster:null}))}>Kaldır</button></div></div>
              : <button className="adm-btn adm-btn--ghost" onClick={()=>setPick({kind:'heroPoster'})}>Poster seç / Yükle</button>}
          </div>
        </div>
        <p className="muted" style={{ fontSize:'.8rem' }}>Video verildiğinde görsel yerine sessiz otomatik döngü olarak gösterilir (kontrol yok).</p>
      </div>

      {/* PRODUCTION */}
      <div className="adm-panel">
        <strong>Üretim (4 aşama · 9:16 video)</strong>
        <div className="adm-grid2" style={{ marginTop:'var(--s-4)' }}>
          {f.production.map((s, i) => (
            <div key={i} style={{ border:'1px solid var(--border)', borderRadius:12, padding:'var(--s-4)' }}>
              <div className="adm-tag" style={{ marginBottom:'.5rem' }}>{initial.de.production[i].n}</div>
              <div className="field"><label>Başlık ({tab.toUpperCase()})</label><input className="input" value={s.title} onChange={e=>setF({production:f.production.map((x,j)=>j===i?{...x,title:e.target.value}:x)})} /></div>
              <div className="field"><label>Açıklama ({tab.toUpperCase()})</label><textarea className="textarea" rows={2} value={s.body} onChange={e=>setF({production:f.production.map((x,j)=>j===i?{...x,body:e.target.value}:x)})} /></div>
              <div style={{ display:'flex', gap:'.4rem', flexWrap:'wrap' }}>
                <button className="linkbtn" onClick={()=>setPick({kind:'prodVideo',i})}>{shared.prodMedia[i]?.video?'Video ✓':'Video seç'}</button>
                <button className="linkbtn" onClick={()=>setPick({kind:'prodPoster',i})}>{shared.prodMedia[i]?.poster?'Poster ✓':'Poster seç'}</button>
                {shared.prodMedia[i]?.video && <button className="linkbtn" style={{color:'#B42318'}} onClick={()=>setShared(st=>({...st,prodMedia:st.prodMedia.map((x,j)=>j===i?{...x,video:null}:x)}))}>Video kaldır</button>}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* GALLERY */}
      <MediaList title="Üretim galerisi" items={shared.gallery} onAdd={()=>setPick({kind:'gallery'})}
        onAlt={(i,v)=>setShared(s=>({...s,gallery:s.gallery.map((x,j)=>j===i?{...x,alt:v}:x)}))}
        onMove={(i,d)=>setShared(s=>({...s,gallery:move(s.gallery,i,d)}))}
        onRemove={i=>setShared(s=>({...s,gallery:s.gallery.filter((_,j)=>j!==i)}))} altLabel="Alt metin" />

      {/* REFERENCES */}
      <MediaList title="Referans logoları" items={shared.logos} onAdd={()=>setPick({kind:'logo'})}
        onAlt={(i,v)=>setShared(s=>({...s,logos:s.logos.map((x,j)=>j===i?{...x,alt:v}:x)}))}
        onMove={(i,d)=>setShared(s=>({...s,logos:move(s.logos,i,d)}))}
        onRemove={i=>setShared(s=>({...s,logos:s.logos.filter((_,j)=>j!==i)}))} altLabel="Firma adı" />

      {/* SECTION HEADINGS / COPY (CMS) */}
      <div className="adm-panel">
        <strong>Bölüm başlıkları & metinleri ({tab.toUpperCase()})</strong>
        <p className="muted" style={{ fontSize:'.82rem', marginTop:'.25rem' }}>
          Ana sayfa bölümlerinin eyebrow/başlık/açıklama ve boş-durum metinleri. Kaydet → storefront güncellenir.
        </p>
        {SECTION_GROUPS.map(g => (
          <div key={g.group} style={{ marginTop:'var(--s-4)' }}>
            <div className="adm-tag" style={{ marginBottom:'.5rem' }}>{g.group}</div>
            <div className="adm-grid2">
              {g.fields.map(fld => (
                <div className="field" key={fld.key}>
                  <label>{fld.label}</label>
                  {fld.area
                    ? <textarea className="textarea" rows={2} value={f.sections[fld.key]}
                        onChange={e=>setF({ sections: { ...f.sections, [fld.key]: e.target.value } })} />
                    : <input className="input" value={f.sections[fld.key]}
                        onChange={e=>setF({ sections: { ...f.sections, [fld.key]: e.target.value } })} />}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* SUPPORT */}
      <div className="adm-panel">
        <strong>Destek & iletişim ({tab.toUpperCase()})</strong>
        <div className="adm-grid2" style={{ marginTop:'var(--s-4)' }}>
          <div className="field"><label>Grafik — başlık</label><input className="input" value={f.support.gTitle} onChange={e=>setF({support:{...f.support,gTitle:e.target.value}})} /></div>
          <div className="field"><label>Grafik — WhatsApp</label><input className="input" value={f.support.gWa} onChange={e=>setF({support:{...f.support,gWa:e.target.value}})} /></div>
          <div className="field"><label>Grafik — görünen numara</label><input className="input" value={f.support.gDisp} onChange={e=>setF({support:{...f.support,gDisp:e.target.value}})} /></div>
          <div className="field"><label>Servis — başlık</label><input className="input" value={f.support.sTitle} onChange={e=>setF({support:{...f.support,sTitle:e.target.value}})} /></div>
          <div className="field"><label>Servis — WhatsApp</label><input className="input" value={f.support.sWa} onChange={e=>setF({support:{...f.support,sWa:e.target.value}})} /></div>
          <div className="field"><label>Servis — görünen numara</label><input className="input" value={f.support.sDisp} onChange={e=>setF({support:{...f.support,sDisp:e.target.value}})} /></div>
          <div className="field"><label>E-posta</label><input className="input" value={f.social.email} onChange={e=>setF({social:{...f.social,email:e.target.value}})} /></div>
          <div className="field"><label>Instagram URL</label><input className="input" value={f.social.instagram} onChange={e=>setF({social:{...f.social,instagram:e.target.value}})} /></div>
        </div>
        <p className="muted" style={{ fontSize:'.82rem' }}>Boş sosyal URL storefront’ta bağlantı olarak render edilmez.</p>
      </div>

      {/* §G Trust metrics / stats */}
      <div className="adm-panel">
        <strong>İstatistik / güven metrikleri ({tab.toUpperCase()})</strong>
        <p className="muted" style={{ fontSize:'.82rem', margin:'.25rem 0 var(--s-3)' }}>Ana sayfadaki sayısal güven şeridi. Değer + etiket.</p>
        {f.stats.map((st,i)=>(
          <div className="adm-grid2" key={i} style={{ marginBottom:'.4rem' }}>
            <div className="field"><label>Değer #{i+1}</label><input className="input" value={st.value} onChange={e=>setF({stats:f.stats.map((x,j)=>j===i?{...x,value:e.target.value}:x)})} /></div>
            <div className="field"><label>Etiket #{i+1}</label><input className="input" value={st.label} onChange={e=>setF({stats:f.stats.map((x,j)=>j===i?{...x,label:e.target.value}:x)})} /></div>
          </div>
        ))}
      </div>

      {/* §G Why BUGO cards */}
      <div className="adm-panel">
        <strong>Warum BUGO kartları ({tab.toUpperCase()})</strong>
        {f.whyBugo.map((u,i)=>(
          <div className="adm-grid2" key={i} style={{ marginBottom:'.4rem' }}>
            <div className="field"><label>Başlık #{i+1}</label><input className="input" value={u.title} onChange={e=>setF({whyBugo:f.whyBugo.map((x,j)=>j===i?{...x,title:e.target.value}:x)})} /></div>
            <div className="field"><label>Metin #{i+1}</label><input className="input" value={u.body} onChange={e=>setF({whyBugo:f.whyBugo.map((x,j)=>j===i?{...x,body:e.target.value}:x)})} /></div>
          </div>
        ))}
      </div>

      {/* §G Industries names */}
      <div className="adm-panel">
        <strong>Branşlar / sektör kartları ({tab.toUpperCase()})</strong>
        <p className="muted" style={{ fontSize:'.82rem', margin:'.25rem 0 var(--s-3)' }}>Her satır bir sektör adı.</p>
        <textarea className="textarea" rows={6} value={f.industries.join('\n')} onChange={e=>setF({industries:e.target.value.split('\n').map(x=>x.trim()).filter(Boolean)})} />
      </div>

      {/* §G Brand impact (Markenwirkung) */}
      <div className="adm-panel">
        <strong>Markenwirkung ({tab.toUpperCase()})</strong>
        <div className="field"><label>Başlık</label><input className="input" value={f.brandImpact.title} onChange={e=>setF({brandImpact:{...f.brandImpact,title:e.target.value}})} /></div>
        <div className="field"><label>Paragraf</label><textarea className="textarea" rows={2} value={f.brandImpact.body} onChange={e=>setF({brandImpact:{...f.brandImpact,body:e.target.value}})} /></div>
        <div className="field"><label>Maddeler (her satır bir madde)</label><textarea className="textarea" rows={5} value={f.brandImpact.points.join('\n')} onChange={e=>setF({brandImpact:{...f.brandImpact,points:e.target.value.split('\n')}})} /></div>
      </div>

      {/* §7 Homepage Scents section heading (per locale) */}
      <div className="adm-panel">
        <strong>Düfte / Scents bölüm başlığı ({tab.toUpperCase()})</strong>
        <p className="muted" style={{ fontSize:'.82rem', margin:'.25rem 0 var(--s-3)' }}>Boş bırakılırsa yerleşik varsayılan başlık kullanılır.</p>
        <div className="adm-grid2">
          <div className="field"><label>Eyebrow</label><input className="input" value={f.scentsHeading.eyebrow} onChange={e=>setF({scentsHeading:{...f.scentsHeading,eyebrow:e.target.value}})} /></div>
          <div className="field"><label>Başlık</label><input className="input" value={f.scentsHeading.title} onChange={e=>setF({scentsHeading:{...f.scentsHeading,title:e.target.value}})} /></div>
        </div>
        <div className="field"><label>Açıklama</label><textarea className="textarea" rows={2} value={f.scentsHeading.description} onChange={e=>setF({scentsHeading:{...f.scentsHeading,description:e.target.value}})} /></div>
      </div>

      {/* §G FAQ groups + questions + answers */}
      <div className="adm-panel">
        <strong>SSS grupları ({tab.toUpperCase()})</strong>
        <p className="muted" style={{ fontSize:'.82rem', margin:'.25rem 0 var(--s-3)' }}>Grup başlığı + soru/cevap çiftleri. Boş çiftler kaydedilmez.</p>
        {f.faqGroups.map((g,gi)=>(
          <div key={gi} style={{ borderTop:'1px solid var(--line,#eee)', paddingTop:'var(--s-3)', marginTop:'var(--s-3)' }}>
            <div className="field"><label>Grup #{gi+1}</label><input className="input" value={g.group} onChange={e=>setF({faqGroups:f.faqGroups.map((x,j)=>j===gi?{...x,group:e.target.value}:x)})} /></div>
            {g.items.map((it,ii)=>(
              <div className="adm-grid2" key={ii} style={{ marginBottom:'.35rem' }}>
                <div className="field"><label>Soru</label><input className="input" value={it.q} onChange={e=>setF({faqGroups:f.faqGroups.map((x,j)=>j===gi?{...x,items:x.items.map((y,k)=>k===ii?{...y,q:e.target.value}:y)}:x)})} /></div>
                <div className="field"><label>Cevap</label><input className="input" value={it.a} onChange={e=>setF({faqGroups:f.faqGroups.map((x,j)=>j===gi?{...x,items:x.items.map((y,k)=>k===ii?{...y,a:e.target.value}:y)}:x)})} /></div>
              </div>
            ))}
          </div>
        ))}
      </div>

      {pick && <MediaPicker type={(pick.kind==='prodVideo'||pick.kind==='heroVideo')?'video':'image'} onSelect={onPicked} onClose={()=>setPick(null)} />}
    </>
  );
}

function MediaList({ title, items, onAdd, onAlt, onMove, onRemove, altLabel }:{
  title:string; items:{src:string;alt:string}[]; onAdd:()=>void; onAlt:(i:number,v:string)=>void;
  onMove:(i:number,d:-1|1)=>void; onRemove:(i:number)=>void; altLabel:string }) {
  return (
    <div className="adm-panel">
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
        <strong>{title} <span className="muted" style={{ fontWeight:400 }}>(tüm diller)</span></strong>
        <button className="adm-btn adm-btn--ghost" onClick={onAdd}>+ Ekle</button>
      </div>
      {items.length===0 ? <p className="muted" style={{ fontSize:'.85rem', marginTop:'.5rem' }}>Boş — eklenmezse storefront’ta zarif boş durum korunur.</p> :
        <div className="media-grid" style={{ marginTop:'var(--s-3)' }}>
          {items.map((it,i) => (
            <div className="media-card" key={it.src+i}>
              <div className="media-card__thumb"><img src={it.src} alt="" /></div>
              <div style={{ padding:'.4rem .5rem', display:'grid', gap:'.35rem' }}>
                <input className="input" style={{ fontSize:'.78rem' }} placeholder={altLabel} value={it.alt} onChange={e=>onAlt(i,e.target.value)} />
                <div style={{ display:'flex', justifyContent:'space-between' }}>
                  <span style={{ display:'flex', gap:'.25rem' }}><button className="linkbtn" onClick={()=>onMove(i,-1)}>↑</button><button className="linkbtn" onClick={()=>onMove(i,1)}>↓</button></span>
                  <button className="linkbtn" style={{ color:'#B42318' }} onClick={()=>onRemove(i)}>Kaldır</button>
                </div>
              </div>
            </div>
          ))}
        </div>}
    </div>
  );
}
