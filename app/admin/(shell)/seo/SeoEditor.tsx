'use client';
import { useState } from 'react';
import { type Locale } from '@/i18n/config';
import type { SiteSettings, SeoPageKey, PageSeo, IndustryContent } from '@/lib/settings/model';
import type { MediaRecord } from '@/lib/media/types';
import MediaPicker from '@/components/admin/MediaPicker';
import { saveSeoSettingsAction } from './actions';

const TABS: { id: Locale; label: string }[] = [{ id:'de', label:'DE' }, { id:'en', label:'EN' }, { id:'fr', label:'FR' }];
type Save = 'idle' | 'saving' | 'saved' | 'error';

// Pages that have an on-page intro section where an SEO intro/H1 is meaningful.
const PAGE_LABELS: Record<SeoPageKey, string> = {
  home:'Ana Sayfa', products:'Ürünler / Produkte', scents:'Düfte / Scents', industries:'Branchen / Industries',
  sample:'Duftmuster / Samples', production:'Produktion', autohaus:'Autohaus', werkstatt:'Werkstatt',
  about:'Über BUGO / About', b2b:'B2B', blog:'Blog (indeks)',
};
// Which pages expose an H1 / intro (only pages that render an intro section on the storefront).
// Which pages expose an editable H1 / intro (pages that render an intro section on the
// storefront). §3 Home is excluded here: the hero H1/subtitle is managed in HomeEditor, so
// the SEO center manages only title/meta/OG for Home (no second fake H1/intro source).
// §v1.2.6-final2: 'production' now renders a real /{locale}/produktion landing page whose H1/
// intro come from settings.seo.pages.production (fallback PRODUCTION_COPY), so it is included.
const HAS_INTRO: SeoPageKey[] = ['products','scents','industries','sample','production','autohaus','werkstatt','about','b2b','blog'];
// §3 Pages the SEO center actually manages. §v1.2.6-final2: 'production' is now a legitimate
// managed page — v1.2.6 added the real localized Production route (/de/produktion, /en/production,
// /fr/production) and settings.seo.pages.production already exists in the model, so the SEO center
// edits title/meta/H1/intro/OG for it (no migration, no new field).
const MANAGED_PAGES: SeoPageKey[] = ['home','products','scents','industries','sample','production','autohaus','werkstatt','about','b2b','blog'];

export default function SeoEditor({ initial, configured }:{ initial: SiteSettings; configured: boolean }) {
  const [s, setS] = useState<SiteSettings>(initial);
  const [tab, setTab] = useState<Locale>('de');
  const [save, setSave] = useState<Save>('idle');
  const [msg, setMsg] = useState<string | null>(null);
  const [pickOg, setPickOg] = useState<SeoPageKey | null>(null);

  const setPage = (k: SeoPageKey, field: keyof PageSeo, l: Locale, val: string) =>
    setS(v => ({ ...v, seo: { ...v.seo, pages: { ...v.seo.pages, [k]: { ...v.seo.pages[k], [field]: { ...(v.seo.pages[k][field] as Record<Locale,string>), [l]: val } } } } }));
  const setPageOg = (k: SeoPageKey, url: string | null) =>
    setS(v => ({ ...v, seo: { ...v.seo, pages: { ...v.seo.pages, [k]: { ...v.seo.pages[k], ogImage: url } } } }));
  const setInd = (k: 'autohaus'|'werkstatt', field: keyof IndustryContent, l: Locale, val: string) =>
    setS(v => ({ ...v, industryContent: { ...v.industryContent, [k]: { ...v.industryContent[k], [field]: { ...v.industryContent[k][field], [l]: val } } } }));

  async function onSave() {
    setSave('saving'); setMsg(null);
    const res = await saveSeoSettingsAction(s);
    if (res.ok) { setSave('saved'); setTimeout(()=>setSave('idle'), 2500); }
    else { setSave('error'); setMsg(res.message); }
  }

  // §v1.2.6-final2 STABLE UNIQUE IDENTITY: field() (the SEO title/meta/H1/intro/OG panel) and
  // indBlock() (the industry VISIBLE-content panel) can be rendered for the same page key
  // (autohaus/werkstatt) as sibling elements. Keying both by the bare page key produced two
  // different sibling panels sharing key="autohaus"/key="werkstatt", which is invalid React
  // identity and caused controlled-input keystrokes to append DOM nodes instead of updating in
  // place. Each panel now carries a distinct, namespaced, non-changing key: `seo-page-<k>` for
  // the SEO panel and `industry-visible-<k>` for the visible-content panel — never an index,
  // random value or timestamp.
  const field = (k: SeoPageKey) => {
    const p = s.seo.pages[k];
    return (
      <div className="adm-panel" key={`seo-page-${k}`}>
        <strong>{PAGE_LABELS[k]}</strong>
        <div className="field"><label>SEO başlığı ({tab.toUpperCase()})</label>
          <input className="input" value={p.title[tab]} onChange={e=>setPage(k,'title',tab,e.target.value)} placeholder="Marka eki otomatik eklenir — tekrar yazmayın" /></div>
        <div className="field"><label>Meta açıklama ({tab.toUpperCase()})</label>
          <textarea className="textarea" rows={2} value={p.description[tab]} onChange={e=>setPage(k,'description',tab,e.target.value)} /></div>
        {HAS_INTRO.includes(k) && <>
          <div className="field"><label>H1 ({tab.toUpperCase()})</label>
            <input className="input" value={p.h1[tab]} onChange={e=>setPage(k,'h1',tab,e.target.value)} /></div>
          <div className="field"><label>Sayfa girişi / SEO açıklaması ({tab.toUpperCase()})</label>
            <textarea className="textarea" rows={2} value={p.intro[tab]} onChange={e=>setPage(k,'intro',tab,e.target.value)} /></div>
        </>}
        <div className="field"><label>OG görseli (isteğe bağlı)</label>
          {p.ogImage
            ? <div className="media-slot"><img src={p.ogImage} alt="" /><div className="media-slot__act"><button className="linkbtn" onClick={()=>setPickOg(k)}>Değiştir</button><button className="linkbtn" style={{color:'#B42318'}} onClick={()=>setPageOg(k,null)}>Kaldır</button></div></div>
            : <button className="adm-btn adm-btn--ghost" onClick={()=>setPickOg(k)}>Seç / Yükle</button>}
        </div>
      </div>
    );
  };

  const indBlock = (k: 'autohaus'|'werkstatt', label: string) => {
    const c = s.industryContent[k];
    // §3 Industry content = VISIBLE H1/body only. SEO title/meta/OG for these pages is the
    // seo.pages.autohaus / seo.pages.werkstatt block (single source) rendered by field() below.
    return (
      <div className="adm-panel" key={`industry-visible-${k}`}>
        <strong>{label} — görünen içerik ({tab.toUpperCase()})</strong>
        <p className="muted" style={{ fontSize:'.82rem', margin:'.25rem 0 var(--s-3)' }}>Yalnızca sayfadaki H1 ve gövde metni. SEO başlığı/açıklaması aşağıdaki “{label}” SEO kartından yönetilir (tek kaynak).</p>
        <div className="field"><label>H1</label><input className="input" value={c.h1[tab]} onChange={e=>setInd(k,'h1',tab,e.target.value)} /></div>
        <div className="field"><label>Gövde / içerik</label><textarea className="textarea" rows={3} value={c.body[tab]} onChange={e=>setInd(k,'body',tab,e.target.value)} /></div>
      </div>
    );
  };

  return (
    <>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', gap:'.5rem', marginBottom:'var(--s-4)', flexWrap:'wrap' }}>
        <div className="adm-tabs" role="tablist">{TABS.map(t=><button key={t.id} role="tab" aria-selected={tab===t.id} className="adm-tab" onClick={()=>setTab(t.id)}>{t.label}</button>)}</div>
        <div style={{ display:'flex', gap:'.5rem', alignItems:'center' }}>
          {save==='saved' && <span className="adm-tag">Kaydedildi ✓</span>}
          <button className="adm-btn adm-btn--primary" disabled={!configured || save==='saving'} onClick={onSave}>{save==='saving'?'Kaydediliyor…':'Kaydet'}</button>
        </div>
      </div>
      {!configured && <div className="adm-note" style={{ marginBottom:'var(--s-4)' }}><span>ⓘ</span><span>Supabase yapılandırılmadığı için kaydetme devre dışı.</span></div>}
      {save==='error' && msg && <div className="adm-note" style={{ marginBottom:'var(--s-4)', background:'#FEECEC', borderColor:'#F5C2C2', color:'#B42318' }}><span>⚠</span><span>{msg}</span></div>}
      <div className="adm-note" style={{ marginBottom:'var(--s-4)' }}><span>ⓘ</span>
        <span>Canonical, hreflang, x-default, JSON-LD, sitemap ve robots otomatik yönetilir — burada düzenlenmez. Başlıklara marka eki tek sefer otomatik eklenir.</span></div>

      {MANAGED_PAGES.filter(k => k!=='autohaus' && k!=='werkstatt').map(field)}

      <h2 style={{ fontSize:'1.05rem', margin:'var(--s-5) 0 var(--s-3)' }}>Sektör sayfaları (görünen içerik + SEO)</h2>
      {indBlock('autohaus','Autohaus')}
      {indBlock('werkstatt','Werkstatt')}
      {/* also expose the page-SEO OG for the two industry pages via the same list above */}
      {field('autohaus')}
      {field('werkstatt')}

      {pickOg && <MediaPicker type="image" onSelect={(m: MediaRecord)=>{ setPageOg(pickOg, m.url); setPickOg(null); }} onClose={()=>setPickOg(null)} />}
    </>
  );
}
