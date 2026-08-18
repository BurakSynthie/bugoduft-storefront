'use client';
import { useState } from 'react';
import { locales, type Locale } from '@/i18n/config';
import type { EditableScent, ScentTr } from '@/lib/scents/model';
import { SCENT_CATEGORIES, CATALOG_GROUPS, MAIN_COLLECTIONS, type CatalogGroup } from '@/lib/scents/model';
import { saveScentAction, reorderScentAction, deleteScentAction } from './actions';

const TABS: { id: Locale; label: string }[] = [
  { id:'de', label:'DE' }, { id:'en', label:'EN' }, { id:'fr', label:'FR' },
];
const COLLECTION_LABELS: Record<string, string> = { STANDARD:'Standard', PREMIUM:'Premium', DELUXE:'Deluxe', VIP:'VIP' };
const newScent = (sort: number): EditableScent => ({
  id:null, code:'', category:'frisch', catalogGroup:null, isActive:true, featured:false, sortOrder:sort,
  availability:[...MAIN_COLLECTIONS],   // new scents default to available on all four products
  tr: Object.fromEntries(locales.map(l => [l, { name:'', description:'' }])) as Record<Locale, ScentTr>,
});

export default function ScentsAdmin({ initial, configured }:{ initial: EditableScent[]; configured: boolean }) {
  const [items, setItems] = useState<EditableScent[]>(initial);
  const [editing, setEditing] = useState<EditableScent | null>(null);
  const [tab, setTab] = useState<Locale>('de');
  const [msg, setMsg] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function onSave() {
    if (!editing) return;
    setSaving(true); setMsg(null);
    const res = await saveScentAction(editing);
    setSaving(false);
    if (res.ok) { setEditing(null); location.reload(); }
    else setMsg(res.message);
  }
  async function onReorder(id: string, dir: -1 | 1) {
    const res = await reorderScentAction(id, dir);
    if (res.ok) location.reload(); else setMsg(res.message);
  }
  async function onDelete(s: EditableScent) {
    if (!s.id) return;
    const res = await deleteScentAction(s.id, s.code);
    if (res.ok) setItems(prev => prev.filter(x => x.id !== s.id));
    else setMsg(res.blockedBy ? `${res.message} (${res.blockedBy.join(', ')})` : res.message);
  }
  function toggleAvailability(code: string) {
    if (!editing) return;
    const has = editing.availability.includes(code);
    const next = has ? editing.availability.filter(c => c !== code) : [...editing.availability, code];
    setEditing({ ...editing, availability: next });
  }

  return (
    <div>
      {!configured && <div className="adm-note" style={{ marginBottom:'var(--s-4)' }}><span>ⓘ</span><span>Supabase yapılandırılmadığı için düzenleme devre dışı.</span></div>}
      {msg && <div className="adm-note" style={{ marginBottom:'var(--s-4)', background:'#FEECEC', borderColor:'#F5C2C2', color:'#B42318' }}><span>⚠</span><span>{msg}</span></div>}

      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'var(--s-4)' }}>
        <strong>{items.length} koku</strong>
        <button className="adm-btn adm-btn--primary" disabled={!configured} onClick={()=>{ setEditing(newScent(items.length)); setTab('de'); }}>+ Yeni koku</button>
      </div>

      <div className="adm-panel">
        <table className="adm-table adm-hide-mobile">
          <thead><tr><th>Sıra</th><th>Kod</th><th>Ad (DE)</th><th>Kategori</th><th>Durum</th><th></th></tr></thead>
          <tbody>
            {items.map(s => (
              <tr key={s.id ?? s.code}>
                <td><span style={{ display:'flex', gap:'.25rem' }}>
                  <button className="linkbtn" onClick={()=>s.id&&onReorder(s.id,-1)}>↑</button>
                  <button className="linkbtn" onClick={()=>s.id&&onReorder(s.id,1)}>↓</button></span></td>
                <td>{s.code}</td><td>{s.tr.de.name}</td><td>{s.category}</td>
                <td>{s.isActive ? <span className="adm-tag">Aktif</span> : <span className="adm-tag adm-tag--off">Pasif</span>}</td>
                <td style={{ textAlign:'right', whiteSpace:'nowrap' }}>
                  <button className="adm-btn adm-btn--ghost" onClick={()=>{ setEditing({...s, tr:{...s.tr}}); setTab('de'); }}>Düzenle</button>
                  <button className="linkbtn" style={{ color:'#B42318', marginLeft:'.5rem' }} onClick={()=>onDelete(s)}>Sil</button>
                </td>
              </tr>
            ))}
            {!items.length && <tr><td colSpan={6} className="muted">Koku yok.</td></tr>}
          </tbody>
        </table>
        <div className="adm-cardlist">
          {items.map(s => (
            <div className="adm-ucard" key={s.id ?? s.code}>
              <div className="adm-ucard__row"><span className="adm-ucard__name">{s.tr.de.name}</span>
                {s.isActive ? <span className="adm-tag">Aktif</span> : <span className="adm-tag adm-tag--off">Pasif</span>}</div>
              <div className="adm-ucard__meta"><span>{s.code}</span><span>{s.category}</span></div>
              <div className="adm-ucard__foot">
                <span style={{ display:'flex', gap:'.4rem' }}>
                  <button className="linkbtn" onClick={()=>s.id&&onReorder(s.id,-1)}>↑</button>
                  <button className="linkbtn" onClick={()=>s.id&&onReorder(s.id,1)}>↓</button></span>
                <span>
                  <button className="adm-btn adm-btn--ghost" onClick={()=>{ setEditing({...s, tr:{...s.tr}}); setTab('de'); }}>Düzenle</button>
                  <button className="linkbtn" style={{ color:'#B42318', marginLeft:'.5rem' }} onClick={()=>onDelete(s)}>Sil</button>
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {editing && (
        <div className="mp" role="dialog" aria-modal="true" aria-label="Koku düzenle">
          <div className="mp__scrim" onClick={()=>setEditing(null)} />
          <div className="mp__panel">
            <div className="mp__head"><strong>{editing.id ? 'Koku düzenle' : 'Yeni koku'}</strong>
              <div style={{ display:'flex', gap:'.5rem' }}>
                <button className="adm-btn adm-btn--primary" disabled={saving||!configured} onClick={onSave}>{saving?'Kaydediliyor…':'Kaydet'}</button>
                <button className="adm-btn adm-btn--ghost" onClick={()=>setEditing(null)}>Kapat</button>
              </div>
            </div>
            <div className="mp__body">
              <div className="adm-grid2">
                <div className="field"><label>Kod (stabil)</label><input className="input" value={editing.code} onChange={e=>setEditing({...editing, code:e.target.value})} placeholder="ör. frisch-ocean" /></div>
                <div className="field"><label>Kategori (koku profili)</label>
                  <select className="input" value={editing.category} onChange={e=>setEditing({...editing, category:e.target.value})}>
                    {SCENT_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                  </select></div>
                <div className="field"><label>Koku grubu (ticari)</label>
                  <select className="input" value={editing.catalogGroup ?? ''} onChange={e=>setEditing({...editing, catalogGroup:(e.target.value ? e.target.value as CatalogGroup : null)})}>
                    <option value="">— (belirsiz)</option>
                    {CATALOG_GROUPS.map(g => <option key={g} value={g}>{g}</option>)}
                  </select></div>
                <div className="field"><label>Sıra</label><input className="input" inputMode="numeric" value={editing.sortOrder} onChange={e=>setEditing({...editing, sortOrder:parseInt(e.target.value.replace(/\D/g,''),10)||0})} /></div>
                <div className="field" style={{ display:'flex', gap:'1rem', alignItems:'center', paddingTop:'1.6rem' }}>
                  <label style={{ display:'inline-flex', gap:'.4rem', alignItems:'center' }}><input type="checkbox" checked={editing.isActive} onChange={e=>setEditing({...editing, isActive:e.target.checked})} /> Aktif</label>
                  <label style={{ display:'inline-flex', gap:'.4rem', alignItems:'center' }}><input type="checkbox" checked={editing.featured} onChange={e=>setEditing({...editing, featured:e.target.checked})} /> Öne çıkan</label>
                </div>
              </div>
              <div className="field" style={{ marginTop:'var(--s-3)' }}>
                <label>Ürün uygunluğu (product_scents)</label>
                <div style={{ display:'flex', gap:'1rem', flexWrap:'wrap', marginTop:'.35rem' }}>
                  {MAIN_COLLECTIONS.map(code => (
                    <label key={code} style={{ display:'inline-flex', gap:'.4rem', alignItems:'center' }}>
                      <input type="checkbox" checked={editing.availability.includes(code)} onChange={()=>toggleAvailability(code)} />
                      {COLLECTION_LABELS[code] ?? code}
                    </label>
                  ))}
                </div>
                <small className="muted" style={{ display:'block', marginTop:'.3rem' }}>
                  Bu koku hangi ana ürünlerde seçilebilir. Checkout doğrulaması bu değeri kullanır. (Katalog grubu yalnızca açıklayıcıdır, uygunluğu belirlemez.)
                </small>
              </div>
              <div className="adm-tabs" role="tablist" style={{ marginTop:'var(--s-3)' }}>
                {TABS.map(t => <button key={t.id} role="tab" aria-selected={tab===t.id} className="adm-tab" onClick={()=>setTab(t.id)}>{t.label}</button>)}
              </div>
              <div className="field"><label>Ad ({tab.toUpperCase()})</label><input className="input" value={editing.tr[tab].name} onChange={e=>setEditing({...editing, tr:{...editing.tr, [tab]:{...editing.tr[tab], name:e.target.value}}})} /></div>
              <div className="field"><label>Açıklama ({tab.toUpperCase()})</label><input className="input" value={editing.tr[tab].description} onChange={e=>setEditing({...editing, tr:{...editing.tr, [tab]:{...editing.tr[tab], description:e.target.value}}})} /></div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
