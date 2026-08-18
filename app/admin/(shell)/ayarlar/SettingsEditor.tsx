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
  const setFooterText = (k: keyof SiteSettings['footer'], l: Locale, val: string) => setS(v => ({ ...v, footer: { ...v.footer, [k]: { ...v.footer[k], [l]: val } } }));
  const setSeoHome = (k: keyof SiteSettings['seo']['home'], l: Locale, val: string) => setS(v => ({ ...v, seo: { ...v.seo, home: { ...v.seo.home, [k]: { ...v.seo.home[k], [l]: val } } } }));
  const setPaidSample = (patch: Partial<SiteSettings['commerce']['paidSample']>) => setS(v => ({ ...v, commerce: { ...v.commerce, paidSample: { ...v.commerce.paidSample, ...patch } } }));
  const setFirstOrder = (patch: Partial<SiteSettings['commerce']['firstOrder']>) => setS(v => ({ ...v, commerce: { ...v.commerce, firstOrder: { ...v.commerce.firstOrder, ...patch } } }));
  const eurToCents = (raw: string) => Math.round((parseFloat(raw.replace(',', '.')) || 0) * 100);
  const centsToEur = (c: number) => (c / 100).toFixed(2);

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
          <div className="field"><label>E-posta</label><input className="input" value={s.contact.email} onChange={e=>setContact({email:e.target.value})} /><small className="muted">Footer, iletişim alanları ve hızlı iletişim menüsünde kullanılır.</small></div>
          <div className="field"><label>WhatsApp</label><input className="input" value={s.contact.whatsapp} onChange={e=>setContact({whatsapp:e.target.value})} placeholder="90…" /><small className="muted">Hızlı iletişim butonu ve iletişim alanlarında kullanılır.</small></div>
          <div className="field"><label>Telefon</label><input className="input" value={s.contact.phone} onChange={e=>setContact({phone:e.target.value})} /><small className="muted">Müşteri hizmetleri / telefon bağlantılarında kullanılır.</small></div>
          <div className="field"><label>Instagram URL</label><input className="input" value={s.contact.instagram} onChange={e=>setContact({instagram:e.target.value})} /><small className="muted">Site sosyal medya bağlantılarında kullanılır.</small></div>
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

      <div className="adm-panel">
        <strong>Hızlı İletişim (yüzen buton)</strong>
        <div style={{ display:'flex', gap:'1.2rem', flexWrap:'wrap', marginTop:'var(--s-3)' }}>
          <label style={{ display:'inline-flex', gap:'.4rem', alignItems:'center' }}>
            <input type="checkbox" checked={s.quickContact.enabled}
              onChange={e=>setS(v=>({ ...v, quickContact:{ ...v.quickContact, enabled:e.target.checked } }))} /> Etkin
          </label>
        </div>
        <p className="muted" style={{ fontSize:'.82rem', marginTop:'.4rem' }}>
          Yukarıdaki iletişim bilgilerini (WhatsApp / e-posta / telefon) kullanır. Boş hedefler gösterilmez.
        </p>
      </div>

      <div className="adm-panel">
        <strong>Yasal bilgiler (Impressum / Datenschutz)</strong>
        <p className="muted" style={{ fontSize:'.82rem', marginTop:'.25rem' }}>
          Impressum ve Gizlilik sayfalarında kullanılır. Eksikse sayfada uyarı gösterilir; asla sahte değer yazılmaz.
        </p>
        <div className="adm-grid2" style={{ marginTop:'var(--s-3)' }}>
          <div className="field"><label>Firma / Ünvan</label><input className="input" value={s.legal.companyName} onChange={e=>setS(v=>({...v, legal:{...v.legal, companyName:e.target.value}}))} /></div>
          <div className="field"><label>Yetkili / Temsilci</label><input className="input" value={s.legal.representative} onChange={e=>setS(v=>({...v, legal:{...v.legal, representative:e.target.value}}))} /></div>
          <div className="field"><label>Adres</label><input className="input" value={s.legal.address} onChange={e=>setS(v=>({...v, legal:{...v.legal, address:e.target.value}}))} /></div>
          <div className="field"><label>Vergi / USt-IdNr. (varsa)</label><input className="input" value={s.legal.vatId} onChange={e=>setS(v=>({...v, legal:{...v.legal, vatId:e.target.value}}))} /></div>
          <div className="field"><label>Yasal e-posta</label><input className="input" value={s.legal.email} onChange={e=>setS(v=>({...v, legal:{...v.legal, email:e.target.value}}))} /></div>
        </div>
      </div>

      <div className="adm-panel">
        <strong>Üretim/menşe ifadesi (tek kaynak)</strong>
        <p className="muted" style={{ fontSize:'.82rem', marginTop:'.25rem' }}>
          Footer alt satırında görünen ticari ifade. Boş bırakılırsa bir şey gösterilmez. Menşe iddiası uydurulmaz.
        </p>
        <div className="adm-grid2" style={{ marginTop:'var(--s-3)' }}>
          <div className="field"><label>DE</label><input className="input" value={s.originClaim.de} onChange={e=>setS(v=>({...v, originClaim:{...v.originClaim, de:e.target.value}}))} /></div>
          <div className="field"><label>EN</label><input className="input" value={s.originClaim.en} onChange={e=>setS(v=>({...v, originClaim:{...v.originClaim, en:e.target.value}}))} /></div>
          <div className="field"><label>FR</label><input className="input" value={s.originClaim.fr} onChange={e=>setS(v=>({...v, originClaim:{...v.originClaim, fr:e.target.value}}))} /></div>
        </div>
      </div>

      {/* free sample rule */}
      <div className="adm-panel">
        <strong>Ücretsiz numune kuralı</strong>
        <p className="muted" style={{ fontSize:'.82rem', margin:'.3rem 0 var(--s-3)' }}>Belirlenen adet ve üzeri siparişlerde 40’lı koku numune seti ücretsiz eklenir. Konfigüratörde ve siparişte gösterilir.</p>
        <label style={{ display:'inline-flex', gap:'.5rem', alignItems:'center', marginBottom:'var(--s-3)' }}>
          <input type="checkbox" checked={s.sample.enabled} onChange={e=>setS(v=>({...v, sample:{...v.sample, enabled:e.target.checked}}))} /> Etkin
        </label>
        <div className="adm-grid2">
          <div className="field"><label>Eşik (adet)</label><input className="input" inputMode="numeric" value={s.sample.threshold} onChange={e=>setS(v=>({...v, sample:{...v.sample, threshold:parseInt(e.target.value.replace(/\D/g,''),10)||0}}))} /></div>
          <div className="field"><label>Numune değeri (€)</label><input className="input" inputMode="numeric" value={s.sample.valueEur} onChange={e=>setS(v=>({...v, sample:{...v.sample, valueEur:parseInt(e.target.value.replace(/\D/g,''),10)||0}}))} /></div>
        </div>
      </div>

      {/* commercial values (paid Duftmuster-Set + first-order benefit) */}
      <div className="adm-panel">
        <strong>Ticari değerler</strong>
        <p className="muted" style={{ fontSize:'.82rem', margin:'.3rem 0 var(--s-3)' }}>Ücretli Duftmuster-Set fiyatı/kredisi ve ilk sipariş indirimi. Bu değerler kaynak kodu değiştirmeden buradan yönetilir. Vorteiller birleştirilmez; sunucu geçerli en yüksek vorteili uygular.</p>

        <div style={{ display:'grid', gap:'var(--s-3)' }}>
          <label style={{ display:'inline-flex', gap:'.5rem', alignItems:'center' }}>
            <input type="checkbox" checked={s.commerce.paidSample.enabled} onChange={e=>setPaidSample({ enabled:e.target.checked })} /> Ücretli Duftmuster-Set etkin
          </label>
          <div className="adm-grid2">
            <div className="field"><label>Set fiyatı (€)</label>
              <input className="input" inputMode="decimal" defaultValue={centsToEur(s.commerce.paidSample.priceCents)} onBlur={e=>setPaidSample({ priceCents: eurToCents(e.target.value) })} /></div>
            <div className="field"><label>Sonuç kredi (€)</label>
              <input className="input" inputMode="decimal" defaultValue={centsToEur(s.commerce.paidSample.creditCents)} onBlur={e=>setPaidSample({ creditCents: eurToCents(e.target.value) })} /></div>
          </div>
        </div>

        <div style={{ display:'grid', gap:'var(--s-3)', marginTop:'var(--s-4)', paddingTop:'var(--s-4)', borderTop:'1px solid var(--line,#eee)' }}>
          <label style={{ display:'inline-flex', gap:'.5rem', alignItems:'center' }}>
            <input type="checkbox" checked={s.commerce.firstOrder.enabled} onChange={e=>setFirstOrder({ enabled:e.target.checked })} /> İlk sipariş vorteili etkin
          </label>
          <div className="field" style={{ maxWidth:220 }}><label>İlk sipariş indirimi (%)</label>
            <input className="input" inputMode="numeric" value={s.commerce.firstOrder.percent} onChange={e=>setFirstOrder({ percent: Math.min(100, Math.max(0, parseInt(e.target.value.replace(/\D/g,''),10)||0)) })} /></div>
        </div>
      </div>

      {/* homepage SEO */}
      <div className="adm-panel">
        <strong>Ana sayfa SEO</strong>
        <p className="muted" style={{ fontSize:'.82rem', margin:'.3rem 0 var(--s-3)' }}>Boş bırakılırsa varsayılan başlık/açıklama kullanılır. Canonical ve hreflang bağlantıları otomatik oluşturulur (buradan düzenlenmez). Varsayılan OG görseli için “Marka kimliği” bölümündeki görseli kullanın.</p>
        <div className="adm-tabs" role="tablist">{TABS.map(t=><button key={t.id} role="tab" aria-selected={tab===t.id} className="adm-tab" onClick={()=>setTab(t.id)}>{t.label}</button>)}</div>
        <div className="field"><label>Sayfa başlığı ({tab.toUpperCase()})</label>
          <input className="input" value={s.seo.home.title[tab]} onChange={e=>setSeoHome('title', tab, e.target.value)} placeholder="ör. Individuelle Werbeduftanhänger ab 1.000 Stück" /></div>
        <div className="field"><label>Meta açıklama ({tab.toUpperCase()})</label>
          <textarea className="textarea" rows={2} value={s.seo.home.description[tab]} onChange={e=>setSeoHome('description', tab, e.target.value)} placeholder="ör. Individuell gestaltete Werbeduftanhänger mit Ihrem Logo…" /></div>
      </div>

      {/* footer copy */}
      <div className="adm-panel">
        <strong>Footer metinleri</strong>
        <p className="muted" style={{ fontSize:'.82rem', margin:'.3rem 0 var(--s-3)' }}>Boş bırakılan alanlar için varsayılan metin kullanılır. Yasal/teknik bağlantı etiketleri (Impressum, Datenschutz vb.) buradan değil, sabit sistem çevirilerinden gelir.</p>
        <div className="adm-tabs" role="tablist">{TABS.map(t=><button key={t.id} role="tab" aria-selected={tab===t.id} className="adm-tab" onClick={()=>setTab(t.id)}>{t.label}</button>)}</div>
        <div className="field"><label>Marka açıklaması ({tab.toUpperCase()})</label>
          <input className="input" value={s.footer.brandCopy[tab]} onChange={e=>setFooterText('brandCopy', tab, e.target.value)} placeholder="ör. Individuelle Werbeartikel für Ihr Unternehmen." /></div>
        <div className="field"><label>Minimum sipariş notu ({tab.toUpperCase()})</label>
          <input className="input" value={s.footer.minOrderCopy[tab]} onChange={e=>setFooterText('minOrderCopy', tab, e.target.value)} placeholder="ör. Mindestbestellmenge 1.000 Stück." /></div>
        <div className="field"><label>Alt satır (copyright yanı) ({tab.toUpperCase()})</label>
          <input className="input" value={s.footer.bottomStatement[tab]} onChange={e=>setFooterText('bottomStatement', tab, e.target.value)} placeholder="ör. Made for your brand · Germany" /></div>
      </div>

      {pickOg && <MediaPicker type="image" onSelect={(m: MediaRecord)=>setS(v=>({...v, defaultOgImage:m.url}))} onClose={()=>setPickOg(false)} />}
    </>
  );
}
