'use client';
import { useState, useTransition } from 'react';
import { actSetStatus, actApprove, actTracking, actNotes, actArtworkUrl } from '../actions';

const STATUSES: [string,string][] = [['received','Sipariş Alındı'],['design','Tasarım'],['production','Üretimde'],['shipped','Kargolandı']];

export function StatusControl({ id, current }:{ id:string; current:string }){
  const [pending,start]=useTransition(); const [msg,setMsg]=useState<string|null>(null);
  return (<div className="adm-panel"><strong>Operasyonel durum</strong>
    <div className="adm-toolbar" style={{marginTop:'var(--s-3)'}}>
      {STATUSES.map(([k,label])=>(
        <button key={k} className={`adm-btn${k===current?' adm-btn--primary':''}`} disabled={pending}
          onClick={()=>start(async()=>{ const r=await actSetStatus(id,k as any); setMsg(r.ok?null:'Hata'); })}>{label}</button>))}
    </div>
    <button className="adm-btn adm-btn--ghost" disabled={pending} style={{marginTop:'.5rem'}}
      onClick={()=>start(async()=>{ const r=await actApprove(id); setMsg(r.ok?'Tasarım onaylandı':'Hata'); })}>Tasarım Onaylandı → Üretime al</button>
    {msg && <p className="muted" style={{marginTop:'.5rem'}}>{msg}</p>}
  </div>);
}

export function TrackingControl({ id, tracking }:{ id:string; tracking:string|null }){
  const [val,setVal]=useState(tracking ?? ''); const [pending,start]=useTransition(); const [msg,setMsg]=useState<string|null>(null);
  return (<div className="adm-panel"><strong>Kargo (iclogi)</strong>
    <div className="adm-toolbar" style={{marginTop:'var(--s-3)'}}>
      <input className="input" placeholder="Takip numarası" value={val} onChange={e=>setVal(e.target.value)} />
      <button className="adm-btn adm-btn--primary" disabled={pending||!val.trim()}
        onClick={()=>start(async()=>{ const r=await actTracking(id,val); setMsg(r.ok?'Kaydedildi · Kargolandı':'Hata'); })}>Kargolandı olarak kaydet</button>
    </div>
    {msg && <p className="muted" style={{marginTop:'.5rem'}}>{msg}</p>}
  </div>);
}

export function NotesControl({ id, notes }:{ id:string; notes:string|null }){
  const [val,setVal]=useState(notes ?? ''); const [pending,start]=useTransition(); const [msg,setMsg]=useState<string|null>(null);
  return (<div className="adm-panel"><strong>Admin notları</strong>
    <textarea className="textarea" rows={3} style={{marginTop:'var(--s-3)'}} value={val} onChange={e=>setVal(e.target.value)} />
    <button className="adm-btn adm-btn--primary" disabled={pending} style={{marginTop:'.5rem'}}
      onClick={()=>start(async()=>{ const r=await actNotes(id,val); setMsg(r.ok?'Kaydedildi':'Hata'); })}>Kaydet</button>
    {msg && <span className="muted" style={{marginLeft:'.5rem'}}>{msg}</span>}
  </div>);
}

export function ArtworkLink({ path, label }:{ path:string|null; label:string }){
  const [pending,start]=useTransition();
  if(!path) return <span className="muted">—</span>;
  return <button className="adm-btn adm-btn--ghost" disabled={pending}
    onClick={()=>start(async()=>{ const url=await actArtworkUrl(path); if(url) window.open(url,'_blank','noopener'); })}>{label} ↗</button>;
}
