'use client';
import { useState } from 'react';
import { locales, type Locale } from '@/i18n/config';
import type { EditableCollection, CollectionTr } from '@/lib/collections/model';
import { saveCollectionAction, reorderCollectionAction, deleteCollectionAction } from './actions';

const TABS: { id: Locale; label: string }[] = [{ id:'de', label:'DE' }, { id:'en', label:'EN' }, { id:'fr', label:'FR' }];

export default function CollectionsAdmin({ initial, configured }:{ initial: EditableCollection[]; configured: boolean }) {
  const [items] = useState<EditableCollection[]>(initial);
  const [editing, setEditing] = useState<EditableCollection | null>(null);
  const [tab, setTab] = useState<Locale>('de');
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function onSave() {
    if (!editing) return;
    setSaving(true); setMsg(null);
    const res = await saveCollectionAction(editing);
    setSaving(false);
    if (res.ok) { setEditing(null); location.reload(); }
    else setMsg(res.message);
  }
  async function onReorder(id: string, dir: -1 | 1) { const r = await reorderCollectionAction(id, dir); if (r.ok) location.reload(); else setMsg(r.message); }
  async function onDelete(id: string) { const r = await deleteCollectionAction(id); if (r.ok) location.reload(); else setMsg(r.blockedBy ? `${r.message}` : r.message); }
  const setTr = (patch: Partial<CollectionTr>) => setEditing(e => e ? { ...e, tr: { ...e.tr, [tab]: { ...e.tr[tab], ...patch } } } : e);

  return (
    <div>
      {!configured && <div className="adm-note" style={{ marginBottom:'var(--s-4)' }}><span>ⓘ</span><span>Supabase yapılandırılmadığı için düzenleme devre dışı.</span></div>}
      {msg && <div className="adm-note" style={{ marginBottom:'var(--s-4)', background:'#FEECEC', borderColor:'#F5C2C2', color:'#B42318' }}><span>⚠</span><span>{msg}</span></div>}
      <div className="adm-panel">
        <p className="muted" style={{ marginBottom:'var(--s-3)', fontSize:'.85rem' }}>Koleksiyonlar ürün seviyeleriyle 1:1 eşleşir (Standart/Premium/Deluxe/VIP). Ad, slug, açıklama, SEO, sıra ve yayın durumu düzenlenebilir; silme ürünü bozacaksa engellenir.</p>
        <table className="adm-table adm-hide-mobile">
          <thead><tr><th>Sıra</th><th>Kod</th><th>Ad (DE)</th><th>Durum</th><th></th></tr></thead>
          <tbody>
            {items.map(c => (
              <tr key={c.id}>
                <td><span style={{ display:'flex', gap:'.25rem' }}><button className="linkbtn" onClick={()=>onReorder(c.id,-1)}>↑</button><button className="linkbtn" onClick={()=>onReorder(c.id,1)}>↓</button></span></td>
                <td>{c.code}</td><td>{c.tr.de.name}</td>
                <td>{c.isActive ? <span className="adm-tag">Yayında</span> : <span className="adm-tag adm-tag--off">Pasif</span>}</td>
                <td style={{ textAlign:'right', whiteSpace:'nowrap' }}>
                  <button className="adm-btn adm-btn--ghost" onClick={()=>{ setEditing({...c, tr:{...c.tr}}); setTab('de'); }}>Düzenle</button>
                  <button className="linkbtn" style={{ color:'#B42318', marginLeft:'.5rem' }} onClick={()=>onDelete(c.id)}>Sil</button>
                </td>
              </tr>
            ))}
            {!items.length && <tr><td colSpan={5} className="muted">Koleksiyon yok.</td></tr>}
          </tbody>
        </table>
        <div className="adm-cardlist">
          {items.map(c => (
            <div className="adm-ucard" key={c.id}>
              <div className="adm-ucard__row"><span className="adm-ucard__name">{c.tr.de.name}</span>{c.isActive ? <span className="adm-tag">Yayında</span> : <span className="adm-tag adm-tag--off">Pasif</span>}</div>
              <div className="adm-ucard__meta"><span>{c.code}</span></div>
              <div className="adm-ucard__foot">
                <span style={{ display:'flex', gap:'.4rem' }}><button className="linkbtn" onClick={()=>onReorder(c.id,-1)}>↑</button><button className="linkbtn" onClick={()=>onReorder(c.id,1)}>↓</button></span>
                <button className="adm-btn adm-btn--ghost" onClick={()=>{ setEditing({...c, tr:{...c.tr}}); setTab('de'); }}>Düzenle</button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {editing && (
        <div className="mp" role="dialog" aria-modal="true" aria-label="Koleksiyon düzenle">
          <div className="mp__scrim" onClick={()=>setEditing(null)} />
          <div className="mp__panel">
            <div className="mp__head"><strong>{editing.code}</strong>
              <div style={{ display:'flex', gap:'.5rem' }}>
                <button className="adm-btn adm-btn--primary" disabled={saving||!configured} onClick={onSave}>{saving?'Kaydediliyor…':'Kaydet'}</button>
                <button className="adm-btn adm-btn--ghost" onClick={()=>setEditing(null)}>Kapat</button>
              </div>
            </div>
            <div className="mp__body">
              <div className="adm-grid2">
                <div className="field"><label>Sıra</label><input className="input" inputMode="numeric" value={editing.sortOrder} onChange={e=>setEditing({...editing, sortOrder:parseInt(e.target.value.replace(/\D/g,''),10)||0})} /></div>
                <div className="field" style={{ paddingTop:'1.6rem' }}><label style={{ display:'inline-flex', gap:'.4rem', alignItems:'center' }}><input type="checkbox" checked={editing.isActive} onChange={e=>setEditing({...editing, isActive:e.target.checked})} /> Yayında</label></div>
              </div>
              <div className="adm-tabs" role="tablist">{TABS.map(t=><button key={t.id} role="tab" aria-selected={tab===t.id} className="adm-tab" onClick={()=>setTab(t.id)}>{t.label}</button>)}</div>
              <div className="field"><label>Ad ({tab.toUpperCase()})</label><input className="input" value={editing.tr[tab].name} onChange={e=>setTr({name:e.target.value})} /></div>
              <div className="field"><label>Slug ({tab.toUpperCase()})</label><input className="input" value={editing.tr[tab].slug} onChange={e=>setTr({slug:e.target.value})} /></div>
              <div className="field"><label>Açıklama ({tab.toUpperCase()})</label><textarea className="textarea" rows={2} value={editing.tr[tab].description} onChange={e=>setTr({description:e.target.value})} /></div>
              <div className="field"><label>SEO başlığı ({tab.toUpperCase()})</label><input className="input" value={editing.tr[tab].seoTitle} onChange={e=>setTr({seoTitle:e.target.value})} /></div>
              <div className="field"><label>SEO açıklaması ({tab.toUpperCase()})</label><textarea className="textarea" rows={2} value={editing.tr[tab].seoDescription} onChange={e=>setTr({seoDescription:e.target.value})} /></div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
