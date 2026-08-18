'use client';
import { useEffect, useRef, useState } from 'react';
import type { MediaRecord, MediaType } from '@/lib/media/types';
import { listMediaAction, uploadMediaAction } from '@/lib/media/actions';

// Reusable picker for product/homepage editors. Browse existing media (reuse, no
// duplicate uploads) or upload new; returns the chosen record via onSelect.
export default function MediaPicker({ type, onSelect, onClose }:
  { type: MediaType | 'all'; onSelect: (m: MediaRecord) => void; onClose: () => void }) {
  const [items, setItems] = useState<MediaRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let on = true;
    listMediaAction().then(r => { if (!on) return; setItems(r.ok ? r.data : []); setLoading(false); if (!r.ok) setError(r.message); });
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => { on = false; document.removeEventListener('keydown', onKey); };
  }, [onClose]);

  const shown = type === 'all' ? items : items.filter(m => m.mediaType === type);
  const accept = type === 'video' ? 'video/mp4,video/webm'
    : type === 'image' ? 'image/jpeg,image/png,image/webp'
    : 'image/jpeg,image/png,image/webp,video/mp4,video/webm';

  async function onFiles(files: FileList | null) {
    if (!files || !files.length) return;
    setBusy(true); setError(null);
    const fd = new FormData(); fd.set('file', files[0]);
    const res = await uploadMediaAction(fd);
    if (res.ok) { setItems(prev => [res.data, ...prev]); onSelect(res.data); onClose(); }
    else setError(res.message);
    setBusy(false);
  }

  return (
    <div className="mp" role="dialog" aria-modal="true" aria-label="Medya seç">
      <div className="mp__scrim" onClick={onClose} />
      <div className="mp__panel">
        <div className="mp__head">
          <strong>Medya seç</strong>
          <div style={{ display:'flex', gap:'.5rem' }}>
            <input ref={inputRef} type="file" accept={accept} style={{ display:'none' }} onChange={e => onFiles(e.target.files)} />
            <button className="adm-btn adm-btn--primary" disabled={busy} onClick={() => inputRef.current?.click()}>{busy ? 'Yükleniyor…' : 'Yükle'}</button>
            <button className="adm-btn adm-btn--ghost" onClick={onClose}>Kapat</button>
          </div>
        </div>
        {error && <p className="muted" style={{ color:'#B42318', padding:'0 var(--s-4)' }}>{error}</p>}
        <div className="mp__body">
          {loading ? <p className="muted">Yükleniyor…</p>
            : shown.length === 0 ? <p className="muted">Medya yok. Yeni yükleyin.</p>
            : <div className="media-grid media-grid--pick">
                {shown.map(m => (
                  <button key={m.id} className="media-pick" onClick={() => { onSelect(m); onClose(); }}>
                    {m.mediaType === 'image'
                      ? <img src={m.url} alt={m.originalFilename ?? ''} loading="lazy" />
                      : <video src={m.url} preload="none" muted playsInline />}
                    <span className="media-pick__name">{m.originalFilename ?? m.id}</span>
                  </button>
                ))}
              </div>}
        </div>
      </div>
    </div>
  );
}
