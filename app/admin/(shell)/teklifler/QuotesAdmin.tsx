'use client';
import { useState } from 'react';
import type { QuoteRow, QuoteStatus } from '@/repositories/admin-quotes';
import { updateQuoteStatusAction, deleteQuoteAction } from './actions';

const STATUS: { id: QuoteStatus; label: string }[] = [
  { id:'new', label:'Yeni' }, { id:'in_progress', label:'İşlemde' }, { id:'done', label:'Tamamlandı' },
];
const fmt = (s: string) => new Date(s).toLocaleString('tr-TR', { dateStyle:'medium', timeStyle:'short' });

export default function QuotesAdmin({ initial }: { initial: QuoteRow[] }) {
  const [items, setItems] = useState<QuoteRow[]>(initial);
  const [open, setOpen] = useState<QuoteRow | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  async function setStatus(id: string, status: QuoteStatus) {
    const res = await updateQuoteStatusAction(id, status);
    if (res.ok) setItems(prev => prev.map(q => q.id === id ? { ...q, status } : q));
    else setMsg(res.message);
  }
  async function remove(id: string) {
    const res = await deleteQuoteAction(id);
    if (res.ok) { setItems(prev => prev.filter(q => q.id !== id)); setOpen(null); }
    else setMsg(res.message);
  }
  const tag = (s: QuoteStatus) => STATUS.find(x => x.id === s)?.label ?? s;

  return (
    <div>
      {msg && <div className="adm-note" style={{ marginBottom:'var(--s-4)', background:'#FEECEC', borderColor:'#F5C2C2', color:'#B42318' }}><span>⚠</span><span>{msg}</span></div>}
      <div className="adm-panel">
        <table className="adm-table adm-hide-mobile">
          <thead><tr><th>Tarih</th><th>Firma</th><th>E-posta</th><th>Adet</th><th>Durum</th><th></th></tr></thead>
          <tbody>
            {items.map(q => (
              <tr key={q.id}>
                <td style={{ whiteSpace:'nowrap' }}>{fmt(q.createdAt)}</td>
                <td>{q.company ?? '—'}</td><td>{q.email ?? '—'}</td><td>{q.quantity ?? '—'}</td>
                <td><select className="input" value={q.status} onChange={e=>setStatus(q.id, e.target.value as QuoteStatus)}>{STATUS.map(s=><option key={s.id} value={s.id}>{s.label}</option>)}</select></td>
                <td style={{ textAlign:'right' }}><button className="adm-btn adm-btn--ghost" onClick={()=>setOpen(q)}>Detay</button></td>
              </tr>
            ))}
            {!items.length && <tr><td colSpan={6} className="muted">Henüz teklif talebi yok.</td></tr>}
          </tbody>
        </table>
        <div className="adm-cardlist">
          {items.map(q => (
            <div className="adm-ucard" key={q.id}>
              <div className="adm-ucard__row"><span className="adm-ucard__name">{q.company ?? q.email ?? '—'}</span><span className="adm-tag">{tag(q.status)}</span></div>
              <div className="adm-ucard__meta"><span>{q.email ?? '—'}</span><span>{q.quantity ?? '—'} adet</span></div>
              <div className="adm-ucard__meta"><span>{fmt(q.createdAt)}</span></div>
              <div className="adm-ucard__foot">
                <select className="input" value={q.status} onChange={e=>setStatus(q.id, e.target.value as QuoteStatus)}>{STATUS.map(s=><option key={s.id} value={s.id}>{s.label}</option>)}</select>
                <button className="adm-btn adm-btn--ghost" onClick={()=>setOpen(q)}>Detay</button>
              </div>
            </div>
          ))}
          {!items.length && <p className="muted">Henüz teklif talebi yok.</p>}
        </div>
      </div>

      {open && (
        <div className="mp" role="dialog" aria-modal="true" aria-label="Teklif detayı">
          <div className="mp__scrim" onClick={()=>setOpen(null)} />
          <div className="mp__panel">
            <div className="mp__head"><strong>Teklif detayı</strong>
              <div style={{ display:'flex', gap:'.5rem' }}>
                <button className="linkbtn" style={{ color:'#B42318' }} onClick={()=>remove(open.id)}>Sil</button>
                <button className="adm-btn adm-btn--ghost" onClick={()=>setOpen(null)}>Kapat</button>
              </div>
            </div>
            <div className="mp__body">
              <dl className="adm-dl">
                <div><dt>Tarih</dt><dd>{fmt(open.createdAt)}</dd></div>
                <div><dt>Durum</dt><dd>{tag(open.status)}</dd></div>
                <div><dt>Firma</dt><dd>{open.company ?? '—'}</dd></div>
                <div><dt>Ad</dt><dd>{open.name ?? '—'}</dd></div>
                <div><dt>E-posta</dt><dd>{open.email ?? '—'}</dd></div>
                <div><dt>Telefon</dt><dd>{open.phone ?? '—'}</dd></div>
                <div><dt>Ürün</dt><dd>{open.productCode ?? '—'}</dd></div>
                <div><dt>Adet</dt><dd>{open.quantity ?? '—'}</dd></div>
                <div><dt>Dil</dt><dd>{open.locale?.toUpperCase()}</dd></div>
              </dl>
              <div className="field" style={{ marginTop:'var(--s-3)' }}><label>Mesaj</label>
                <p className="muted" style={{ whiteSpace:'pre-wrap' }}>{open.message ?? '—'}</p></div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
