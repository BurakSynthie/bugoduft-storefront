'use client';
import { useEffect, useRef } from 'react';
import type { ArtworkRef } from '@/lib/configurator/types';
import type { Locale } from '@/i18n/config';
import { sf } from '@/lib/i18n/storefront';

// Browser-previewable raster image types. HEIC/HEIF are intentionally excluded:
// most browsers cannot render them, so we keep the file but show an honest
// "no preview" state instead of faking one. SVG shows as a file card (edge cases).
const PREVIEWABLE = ['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/bmp', 'image/avif'];
const ACCEPT = 'image/*,.pdf,.svg,.ai,.eps,.png,.jpg,.jpeg,.webp,.heic,.heif,application/pdf,image/svg+xml';

function heicLike(f: File): boolean {
  const t = (f.type || '').toLowerCase();
  const n = f.name.toLowerCase();
  return t.includes('heic') || t.includes('heif') || n.endsWith('.heic') || n.endsWith('.heif');
}
export function isPreviewable(f: File): boolean {
  return PREVIEWABLE.includes((f.type || '').toLowerCase());
}
export function fileToRef(f: File): ArtworkRef {
  const previewUrl = isPreviewable(f) ? URL.createObjectURL(f) : null;
  return { name: f.name, type: f.type || f.name.split('.').pop() || 'file', size: f.size, previewUrl, storagePath: null, file: f };
}
function ext(r: ArtworkRef) { return (r.name.split('.').pop() || '?').toUpperCase(); }
function noPreview(r: ArtworkRef): boolean {
  // an image-type file we could not render (e.g. HEIC from a phone camera)
  const t = (r.type || '').toLowerCase();
  return !r.previewUrl && (t.startsWith('image/') || /heic|heif/.test(t));
}

export default function Upload({ id, label, value, onChange, disabled, multiple, onAdd, locale = 'de' }:
  { id: string; label: string; value?: ArtworkRef | null; onChange?: (r: ArtworkRef | null) => void;
    disabled?: boolean; multiple?: boolean; onAdd?: (r: ArtworkRef) => void; locale?: Locale }) {
  const ref = useRef<HTMLInputElement>(null);
  const t = sf(locale);

  // revoke the object URL when this preview goes away or is replaced (no leaks,
  // and forces the correct fresh render after a new camera/gallery pick).
  useEffect(() => {
    const url = value?.previewUrl;
    return () => { if (url) { try { URL.revokeObjectURL(url); } catch { /* noop */ } } };
  }, [value?.previewUrl]);

  function handle(files: FileList | null) {
    if (!files || !files.length) return;
    if (multiple) { Array.from(files).forEach(f => onAdd?.(fileToRef(f))); }
    else { onChange?.(fileToRef(files[0])); }
    if (ref.current) ref.current.value = '';   // allow re-selecting the same file
  }

  if (value) {
    return (
      <div>
        <div className="filecard">
          <span className="thumb">{value.previewUrl ? <img src={value.previewUrl} alt="" /> : ext(value)}</span>
          <div><b>{value.name}</b><br /><small>{ext(value)} · {(value.size / 1024).toFixed(0)} KB</small></div>
          {!disabled && <button type="button" aria-label={t.remove} onClick={() => onChange?.(null)}>×</button>}
        </div>
        {noPreview(value) && <p className="cfg__note" style={{ marginTop: '.35rem' }}>{t.unsupportedPreview}</p>}
      </div>
    );
  }
  return (
    <div className="up">
      <input ref={ref} id={id} type="file" accept={ACCEPT} disabled={disabled} multiple={multiple}
        onChange={e => handle(e.target.files)} />
      <label htmlFor={id}>{label}</label>
      <div className="cfg__note" style={{ marginTop: '.35rem' }}>PDF, SVG, AI, EPS, PNG, JPG, WebP</div>
    </div>
  );
}
