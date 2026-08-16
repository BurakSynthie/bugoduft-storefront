'use client';
import { useRef } from 'react';
import type { ArtworkRef } from '@/lib/configurator/types';

const PREVIEWABLE = ['image/png','image/jpeg'];              // only these render in-browser
const ACCEPT = '.pdf,.svg,.ai,.eps,.png,.jpg,.jpeg,image/png,image/jpeg,image/svg+xml,application/pdf';

export function fileToRef(f: File): ArtworkRef {
  const previewUrl = PREVIEWABLE.includes(f.type) ? URL.createObjectURL(f) : null;
  return { name:f.name, type:f.type || f.name.split('.').pop() || 'file', size:f.size, previewUrl, storagePath:null, file:f };
}
function ext(r: ArtworkRef){ return (r.name.split('.').pop() || '?').toUpperCase(); }

export default function Upload({ id, label, value, onChange, disabled, multiple, onAdd }:
  { id:string; label:string; value?:ArtworkRef|null; onChange?:(r:ArtworkRef|null)=>void;
    disabled?:boolean; multiple?:boolean; onAdd?:(r:ArtworkRef)=>void }) {
  const ref = useRef<HTMLInputElement>(null);
  function handle(files: FileList|null){
    if(!files||!files.length) return;
    if(multiple){ Array.from(files).forEach(f=>onAdd?.(fileToRef(f))); }
    else { onChange?.(fileToRef(files[0])); }
    if(ref.current) ref.current.value='';
  }
  if (value) {
    return (
      <div className="filecard">
        <span className="thumb">{value.previewUrl ? <img src={value.previewUrl} alt="" /> : ext(value)}</span>
        <div><b>{value.name}</b><br/><small>{ext(value)} · {(value.size/1024).toFixed(0)} KB</small></div>
        {!disabled && <button type="button" aria-label="Entfernen" onClick={()=>onChange?.(null)}>×</button>}
      </div>
    );
  }
  return (
    <div className="up">
      <input ref={ref} id={id} type="file" accept={ACCEPT} disabled={disabled} multiple={multiple}
        onChange={e=>handle(e.target.files)} />
      <label htmlFor={id}>{label}</label>
      <div className="cfg__note" style={{marginTop:'.35rem'}}>PDF, SVG, AI, EPS, PNG, JPG</div>
    </div>
  );
}
