'use client';
import { useRef, useState } from 'react';
import type { MediaRecord } from '@/lib/media/types';
import { uploadMediaAction, deleteMediaAction, updateMediaAltAction } from '@/lib/media/actions';

function fmtSize(b: number | null) { return b == null ? '' : b < 1024*1024 ? `${Math.round(b/1024)} KB` : `${(b/1048576).toFixed(1)} MB`; }

type AltState = { de: string; en: string; fr: string };
type AltSave = 'idle' | 'saving' | 'saved' | 'error';

function AltEditor({ item, onSaved }: { item: MediaRecord; onSaved: (r: MediaRecord) => void }) {
  const [alt, setAlt] = useState<AltState>({ de: item.altDe ?? '', en: item.altEn ?? '', fr: item.altFr ?? '' });
  const [state, setState] = useState<AltSave>('idle');
  const [open, setOpen] = useState(false);

  async function save() {
    setState('saving');
    const res = await updateMediaAltAction(item.id, { de: alt.de, en: alt.en, fr: alt.fr });
    if (res.ok) {
      setState('saved');
      onSaved({ ...item, altDe: alt.de || null, altEn: alt.en || null, altFr: alt.fr || null });
      setTimeout(() => setState('idle'), 2000);
    } else { setState('error'); }
  }

  if (!open) {
    const has = item.altDe || item.altEn || item.altFr;
    return (
      <button className="linkbtn media-card__altbtn" onClick={() => setOpen(true)}>
        {has ? 'ALT metni düzenle' : 'ALT metni ekle'}
      </button>
    );
  }
  return (
    <div className="media-card__alt">
      <div className="field"><label>ALT (DE)</label>
        <input className="input" value={alt.de} onChange={e => setAlt(a => ({ ...a, de: e.target.value }))} /></div>
      <div className="field"><label>ALT (EN)</label>
        <input className="input" value={alt.en} onChange={e => setAlt(a => ({ ...a, en: e.target.value }))} /></div>
      <div className="field"><label>ALT (FR)</label>
        <input className="input" value={alt.fr} onChange={e => setAlt(a => ({ ...a, fr: e.target.value }))} /></div>
      <div style={{ display:'flex', gap:'.4rem', alignItems:'center' }}>
        <button className="adm-btn adm-btn--primary" disabled={state==='saving'} onClick={save}>
          {state==='saving' ? 'Kaydediliyor…' : 'Kaydet'}
        </button>
        <button className="linkbtn" onClick={() => setOpen(false)}>Kapat</button>
        {state==='saved' && <span className="adm-tag">Kaydedildi ✓</span>}
        {state==='error' && <span className="adm-tag adm-tag--off">Hata</span>}
      </div>
    </div>
  );
}

export default function MediaLibrary({ initial, configured }: { initial: MediaRecord[]; configured: boolean }) {
  const [items, setItems] = useState<MediaRecord[]>(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [blocked, setBlocked] = useState<{ id: string; by: string[] } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  async function onFiles(files: FileList | null) {
    if (!files || !files.length) return;
    setError(null); setBusy(true);
    for (const file of Array.from(files)) {
      const fd = new FormData(); fd.set('file', file);
      const res = await uploadMediaAction(fd);
      if (res.ok) setItems(prev => [res.data, ...prev]);
      else { setError(`${file.name}: ${res.message}`); }
    }
    setBusy(false);
    if (inputRef.current) inputRef.current.value = '';
  }

  async function remove(id: string) {
    setError(null); setBlocked(null);
    const res = await deleteMediaAction(id);
    if (res.ok) setItems(prev => prev.filter(m => m.id !== id));
    else if (res.blockedBy) setBlocked({ id, by: res.blockedBy });
    else setError(res.message);
  }

  const applyAlt = (r: MediaRecord) => setItems(prev => prev.map(m => m.id === r.id ? r : m));

  return (
    <div>
      {!configured && <div className="adm-note" style={{ marginBottom:'var(--s-4)' }}><span>ⓘ</span>
        <span>Supabase yapılandırılmadığı için yükleme devre dışı. Bağlandığında etkinleşir.</span></div>}
      {error && <div className="adm-note" style={{ marginBottom:'var(--s-4)', background:'#FEECEC', borderColor:'#F5C2C2', color:'#B42318' }}>
        <span>⚠</span><span>{error}</span></div>}

      <div className="media-upload">
        <input ref={inputRef} id="media-file" type="file" multiple accept="image/jpeg,image/png,image/webp,video/mp4,video/webm"
          disabled={!configured || busy} onChange={e => onFiles(e.target.files)} style={{ display:'none' }} />
        <label htmlFor="media-file" className={`adm-btn adm-btn--primary${(!configured||busy)?' is-disabled':''}`} aria-disabled={!configured||busy}>
          {busy ? 'Yükleniyor…' : '+ Medya yükle'}
        </label>
        <span className="muted" style={{ fontSize:'.82rem' }}>JPG, PNG, WebP, MP4, WebM · maks. 50 MB · ALT metni SEO için DE/EN/FR girilebilir</span>
      </div>

      {items.length === 0 ? (
        <div className="adm-panel"><p className="muted">Henüz medya yok. Gerçek görseller/videolar yüklendiğinde burada listelenir.</p></div>
      ) : (
        <div className="media-grid">
          {items.map(m => (
            <figure className="media-card" key={m.id}>
              <div className="media-card__thumb">
                {m.mediaType === 'image'
                  ? <img src={m.url} alt={m.altDe ?? m.originalFilename ?? ''} loading="lazy" />
                  : <video src={m.url} controls preload="none" playsInline />}
                <span className="media-card__type">{m.mediaType === 'image' ? 'IMG' : 'VIDEO'}</span>
              </div>
              <figcaption>
                <span className="media-card__name" title={m.originalFilename ?? ''}>{m.originalFilename ?? m.id}</span>
                <span className="muted" style={{ fontSize:'.74rem' }}>{m.mimeType.split('/')[1]?.toUpperCase()} · {fmtSize(m.sizeBytes)}</span>
              </figcaption>
              {m.mediaType === 'image' && <AltEditor item={m} onSaved={applyAlt} />}
              {blocked?.id === m.id ? (
                <div className="media-card__blocked">
                  Kullanımda: {blocked.by.join(', ')}
                  <button className="linkbtn" onClick={() => setBlocked(null)}>Kapat</button>
                </div>
              ) : (
                <button className="media-card__del" onClick={() => remove(m.id)} aria-label="Sil">Sil</button>
              )}
            </figure>
          ))}
        </div>
      )}
    </div>
  );
}
