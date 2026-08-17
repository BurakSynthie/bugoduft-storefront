'use client';
import { useState } from 'react';
import { locales, type Locale } from '@/i18n/config';
import type { SiteSettings } from '@/lib/settings/model';
import type { MediaRecord } from '@/lib/media/types';
import MediaPicker from '@/components/admin/MediaPicker';
import { saveSettingsAction } from './actions';

const TABS: { id: Locale; label: string }[] = [{ id:'de', label:'DE' }, { id:'en', label:'EN' }, { id:'fr', label:'FR' }];
type Save = 'idle' | 'saving' | 'saved' | 'error';

export default function SettingsEditor({ initial, configured }:{ initial: SiteSettings; configured: boolean }) {
  const [s, setS] = useState<SiteSettings>(initial);
  const [tab, setTab] = useState<Locale>('de');
  const [save, setSave] = useState<Save>('idle');
  const [msg, setMsg] = useState<string | null>(null);
  const [pickOg, setPickOg] = useState(false);

  const setAnn = (patch: Partial<SiteSettings['announcement']>) => setS(v => ({ ...v, announcement: { ...v.announcement, ...patch } }));
  const setAnnText = (k: 'text'|'linkLabel', l: Locale, val: string) => setS(v => ({ ...v, announcement: { ...v.announcement, [k]: { ...v.announcement[k], [l]: val } } }));
  const setContact = (patch: Partial<SiteSettings['contact']>) => setS(v => ({ ...v, contact: { ...v.contact, ...patch } }));
  const setSection = (k: keyof SiteSettings['sections'], val: boolean) => setS(v => ({ ...v, sections: { ...v.sections, [k]: val } }));

  async function onSave() {
    setSave('saving'); setMsg(null);
    const res = await saveSettingsAction(s);
    if (res.ok) { setSave('saved'); setTimeout(()=>setSave('idle'), 2500); }
    else { setSave('error'); setMsg(res.message); }
  }

  return (
    <>
      <div style={{ display:'flex', justifyContent:'flex-end', gap:'.5rem', alignItems:'center', marginBottom:'var(--s-4)' }}>
        {save==='saved' && <span className="adm-tag">Kaydedildi ✓</span>}
        <button className="adm-btn adm-btn--primary" disabled={!configured || save==='saving'} onClick={onSave}>{save==='saving'?'Kaydediliyor…':'Kaydet'}</button>
      </div>
      {!configured && <div className="adm-note" style={{ marginBottom:'var(--s-4)' }}><span>ⓘ</span><span>Supabase yapılandırılmadığı için kaydetme devre dışı.</span></div>}
      {save==='error' && msg && <div className="adm-note" style={{ marginBottom:'var(--s-4)', background:'#FEECEC', borderColor:'#F5C2C2', color:'#B42318' }}><span>⚠</span><span>{msg}</span></div>}

      {/* announcement */}
      <div className="adm-panel">
        <strong>Duyuru çubuğu</strong>
        <label style={{ display:'inline-flex', gap:'.5rem', alignItems:'center', margin:'var(--s-3) 0' }}>
          <input type="checkbox" checked={s.announcement.enabled} onChange={e=>setAnn({enabled:e.target.checked})} /> Etkin
        </label>
        <div className="adm-tabs" role="tablist">{TABS.map(t=><button key={t.id} role="tab" aria-selected={tab===t.id} className="adm-tab" onClick={()=>setTab(t.id)}>{t.label}</button>)}</div>
        <div className="field"><label>Metin ({tab.toUpperCase()})</label><input className="input" value={s.announcement.text[tab]} onChange={e=>setAnnText('text', tab, e.target.value)} /></div>
        <div className="adm-grid2">
          <div className="field"><label>Bağlantı etiketi ({tab.toUpperCase()})</label><input className="input" value={s.announcement.linkLabel[tab]} onChange={e=>setAnnText('linkLabel', tab, e.target.value)} /></div>
          <div className="field"><label>Bağlantı (URL)</label><input className="input" value={s.announcement.href} onChange={e=>setAnn({href:e.target.value})} placeholder="/de/produkte veya https://…" /></div>
        </div>
      </div>

      {/* contact / social */}
      <div className="adm-panel">
        <strong>İletişim & sosyal</strong>
        <div className="adm-grid2" style={{ marginTop:'var(--s-4)' }}>
          <div className="field"><label>E-posta</label><input className="input" value={s.contact.email} onChange={e=>setContact({email:e.target.value})} /></div>
          <div className="field"><label>WhatsApp</label><input className="input" value={s.contact.whatsapp} onChange={e=>setContact({whatsapp:e.target.value})} placeholder="90…" /></div>
          <div className="field"><label>Telefon</label><input className="input" value={s.contact.phone} onChange={e=>setContact({phone:e.target.value})} /></div>
          <div className="field"><label>Instagram URL</label><input className="input" value={s.contact.instagram} onChange={e=>setContact({instagram:e.target.value})} /></div>
          <div className="field"><label>Facebook URL</label><input className="input" value={s.contact.facebook} onChange={e=>setContact({facebook:e.target.value})} /></div>
          <div className="field"><label>LinkedIn URL</label><input className="input" value={s.contact.linkedin} onChange={e=>setContact({linkedin:e.target.value})} /></div>
        </div>
        <p className="muted" style={{ fontSize:'.82rem' }}>Boş sosyal alan storefront’ta bağlantı olarak görünmez. Sırlar/anahtarlar burada saklanmaz.</p>
      </div>

      {/* brand identity / OG */}
      <div className="adm-panel">
        <strong>Marka kimliği</strong>
        <div className="adm-grid2" style={{ marginTop:'var(--s-4)' }}>
          <div className="field"><label>Marka adı</label><input className="input" value={s.brandName} onChange={e=>setS(v=>({...v, brandName:e.target.value}))} /></div>
          <div className="field"><label>Varsayılan OG görseli</label>
            {s.defaultOgImage
              ? <div className="media-slot"><img src={s.defaultOgImage} alt="" /><div className="media-slot__act"><button className="linkbtn" onClick={()=>setPickOg(true)}>Değiştir</button><button className="linkbtn" style={{color:'#B42318'}} onClick={()=>setS(v=>({...v, defaultOgImage:null}))}>Kaldır</button></div></div>
              : <button className="adm-btn adm-btn--ghost" onClick={()=>setPickOg(true)}>Seç / Yükle</button>}
          </div>
        </div>
      </div>

      {/* section visibility */}
      <div className="adm-panel">
        <strong>Bölüm görünürlüğü (ana sayfa)</strong>
        <div style={{ display:'flex', gap:'1.2rem', flexWrap:'wrap', marginTop:'var(--s-3)' }}>
          <label style={{ display:'inline-flex', gap:'.4rem', alignItems:'center' }}><input type="checkbox" checked={s.sections.gallery} onChange={e=>setSection('gallery', e.target.checked)} /> Galeri</label>
          <label style={{ display:'inline-flex', gap:'.4rem', alignItems:'center' }}><input type="checkbox" checked={s.sections.references} onChange={e=>setSection('references', e.target.checked)} /> Referanslar</label>
          <label style={{ display:'inline-flex', gap:'.4rem', alignItems:'center' }}><input type="checkbox" checked={s.sections.faq} onChange={e=>setSection('faq', e.target.checked)} /> SSS</label>
        </div>
      </div>

      {pickOg && <MediaPicker type="image" onSelect={(m: MediaRecord)=>setS(v=>({...v, defaultOgImage:m.url}))} onClose={()=>setPickOg(false)} />}
    </>
  );
}
