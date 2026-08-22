'use client';
import { useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { locales, type Locale } from '@/i18n/config';
import MediaPicker from '@/components/admin/MediaPicker';
import type { MediaRecord } from '@/lib/media/types';
import type { BlogBlock } from '@/lib/blog/content';
import { normalizeSlug } from '@/lib/blog/types';
import type { EditableBlogPost, BlogTr, MediaRef } from '@/repositories/admin-blog';
import { saveBlogPostAction, deleteBlogPostAction } from '@/app/admin/(shell)/blog/actions';

const TITLE_MAX = 60, DESC_MAX = 160;
const LOCALE_LABEL: Record<Locale, string> = { de: 'DE', en: 'EN', fr: 'FR' };

function charFlag(v: string, max: number) {
  const n = (v || '').trim().length;
  if (n === 0) return { cls: 'adm-tag adm-tag--off', txt: 'eksik' };
  if (n > max) return { cls: 'adm-tag adm-tag--off', txt: `${n}/${max} (uzun)` };
  return { cls: 'adm-tag', txt: `${n}/${max}` };
}

// A single content block editor row.
function BlockEditor({ block, onChange, onRemove, onMove, onPickImage }: {
  block: BlogBlock;
  onChange: (b: BlogBlock) => void;
  onRemove: () => void;
  onMove: (dir: -1 | 1) => void;
  onPickImage: () => void;
}) {
  const head = (label: string) => (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '.35rem' }}>
      <span className="adm-tag">{label}</span>
      <span style={{ display: 'flex', gap: '.3rem' }}>
        <button type="button" className="adm-btn adm-btn--ghost" onClick={() => onMove(-1)} aria-label="Yukarı">↑</button>
        <button type="button" className="adm-btn adm-btn--ghost" onClick={() => onMove(1)} aria-label="Aşağı">↓</button>
        <button type="button" className="adm-btn adm-btn--ghost" onClick={onRemove} aria-label="Sil">✕</button>
      </span>
    </div>
  );
  const wrap: React.CSSProperties = { border: '1px solid #E4E7EC', borderRadius: 10, padding: '.7rem', marginTop: '.6rem' };

  switch (block.type) {
    case 'paragraph': case 'quote':
      return <div style={wrap}>{head(block.type === 'quote' ? 'Alıntı' : 'Paragraf')}
        <textarea className="input" rows={3} value={block.text}
          onChange={e => onChange({ ...block, text: e.target.value })} /></div>;
    case 'h2': case 'h3':
      return <div style={wrap}>{head(block.type.toUpperCase())}
        <input className="input" value={block.text}
          onChange={e => onChange({ ...block, text: e.target.value })} /></div>;
    case 'bullets': case 'numbers':
      return <div style={wrap}>{head(block.type === 'bullets' ? 'Madde listesi' : 'Numaralı liste')}
        <textarea className="input" rows={4} value={block.items.join('\n')}
          placeholder="Her satır bir öğe"
          onChange={e => onChange({ ...block, items: e.target.value.split('\n') })} /></div>;
    case 'image':
      return <div style={wrap}>{head('Görsel')}
        {block.url
          ? <img src={block.url} alt={block.alt} style={{ maxWidth: 200, borderRadius: 8, display: 'block', marginBottom: '.4rem' }} />
          : <p className="muted" style={{ fontSize: '.85rem' }}>Görsel seçilmedi.</p>}
        <button type="button" className="adm-btn adm-btn--ghost" onClick={onPickImage}>Medya seç</button>
        <input className="input" style={{ marginTop: '.4rem' }} placeholder="ALT metni"
          value={block.alt} onChange={e => onChange({ ...block, alt: e.target.value })} />
        <input className="input" style={{ marginTop: '.4rem' }} placeholder="Açıklama (opsiyonel)"
          value={block.caption} onChange={e => onChange({ ...block, caption: e.target.value })} /></div>;
    case 'cta':
      return <div style={wrap}>{head('Bağlantı / CTA')}
        <input className="input" placeholder="Etiket" value={block.label}
          onChange={e => onChange({ ...block, label: e.target.value })} />
        <input className="input" style={{ marginTop: '.4rem' }} placeholder="URL (/de/... veya https://...)"
          value={block.href} onChange={e => onChange({ ...block, href: e.target.value })} /></div>;
    default:
      return null;
  }
}

export default function BlogEditor({ initial }: { initial: EditableBlogPost }) {
  const router = useRouter();
  const [post, setPost] = useState<EditableBlogPost>(initial);
  const [active, setActive] = useState<Locale>('de');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [picker, setPicker] = useState<null | { kind: 'cover' } | { kind: 'block'; index: number }>(null);
  // Track whether a slug was manually edited so we never silently overwrite it later.
  const slugTouched = useRef<Record<Locale, boolean>>({
    de: Boolean(initial.tr.de.slug), en: Boolean(initial.tr.en.slug), fr: Boolean(initial.tr.fr.slug),
  });

  const tr = post.tr[active];
  const setTr = (patch: Partial<BlogTr>) =>
    setPost(p => ({ ...p, tr: { ...p.tr, [active]: { ...p.tr[active], ...patch } } }));

  function onTitle(v: string) {
    const patch: Partial<BlogTr> = { title: v };
    if (!slugTouched.current[active]) patch.slug = normalizeSlug(v);   // suggest until manually edited
    setTr(patch);
  }
  function onSlug(v: string) {
    slugTouched.current[active] = true;
    setTr({ slug: v });
  }

  // Content block ops (per-locale content).
  const blocks = tr.content;
  const setBlocks = (next: BlogBlock[]) => setTr({ content: next });
  function addBlock(type: BlogBlock['type']) {
    const b: BlogBlock =
      type === 'bullets' || type === 'numbers' ? { type, items: [''] }
      : type === 'image' ? { type: 'image', mediaId: null, url: '', alt: '', caption: '' }
      : type === 'cta' ? { type: 'cta', label: '', href: '', external: false }
      : { type, text: '' } as BlogBlock;
    setBlocks([...blocks, b]);
  }
  function updateBlock(i: number, b: BlogBlock) { setBlocks(blocks.map((x, j) => j === i ? b : x)); }
  function removeBlock(i: number) { setBlocks(blocks.filter((_, j) => j !== i)); }
  function moveBlock(i: number, dir: -1 | 1) {
    const j = i + dir; if (j < 0 || j >= blocks.length) return;
    const next = blocks.slice(); [next[i], next[j]] = [next[j], next[i]]; setBlocks(next);
  }

  function onPicked(m: MediaRecord) {
    if (!picker) return;
    const ref: MediaRef = { id: m.id, url: m.url };
    if (picker.kind === 'cover') {
      setPost(p => ({ ...p, cover: ref }));
    } else {
      const i = picker.index;
      const b = blocks[i];
      if (b && b.type === 'image') updateBlock(i, { ...b, mediaId: m.id, url: m.url, alt: b.alt || m.altDe || '' });
    }
    setPicker(null);
  }

  // Pre-publish warnings (per active locale). Non-blocking guidance, no fake score.
  const warnings = useMemo(() => {
    const w: string[] = [];
    if (!tr.title.trim()) w.push('Başlık eksik.');
    if (!tr.h1.trim()) w.push('H1 eksik (başlık kullanılacak).');
    if (!tr.excerpt.trim()) w.push('Özet (excerpt) eksik.');
    if (!tr.seoTitle.trim()) w.push('SEO başlığı eksik.');
    if (!tr.metaDescription.trim()) w.push('Meta açıklama eksik.');
    if (post.cover && !tr.coverAlt.trim()) w.push('Kapak görseli ALT metni eksik.');
    if (!post.cover) w.push('Kapak görseli seçilmedi.');
    return w;
  }, [tr, post.cover]);

  async function save(nextStatus?: 'draft' | 'published') {
    setSaving(true); setError(null); setOk(null);
    const payload: EditableBlogPost = { ...post, status: nextStatus ?? post.status };
    const res = await saveBlogPostAction(payload);
    setSaving(false);
    if (!res.ok) { setError(res.message); return; }
    setOk('Kaydedildi.');
    if (!post.id) { router.replace(`/admin/blog/${res.id}`); router.refresh(); return; }
    setPost(p => ({ ...p, id: res.id, status: payload.status,
      publishedAt: payload.status === 'published' && !p.publishedAt ? new Date().toISOString() : p.publishedAt }));
    router.refresh();
  }

  async function onDelete() {
    if (!post.id) return;
    setSaving(true); setError(null);
    const res = await deleteBlogPostAction(post.id);
    setSaving(false);
    if (!res.ok) { setError(res.message); return; }
    router.replace('/admin/blog'); router.refresh();
  }

  const titleFlag = charFlag(tr.seoTitle, TITLE_MAX);
  const descFlag = charFlag(tr.metaDescription, DESC_MAX);

  return (
    <>
      <div className="adm__top">
        <div>
          <h1>{post.id ? 'Yazıyı düzenle' : 'Yeni yazı'}</h1>
          <div className="adm__crumb">İçerik / Blog / {post.id ? 'Düzenle' : 'Yeni'}</div>
        </div>
        <div style={{ display: 'flex', gap: '.5rem', alignItems: 'center' }}>
          {post.status === 'published'
            ? <span className="adm-tag">Yayında</span>
            : <span className="adm-tag adm-tag--off">Taslak</span>}
          <button className="adm-btn" disabled={saving} onClick={() => save('draft')}>Taslak kaydet</button>
          <button className="adm-btn adm-btn--primary" disabled={saving} onClick={() => save('published')}>Yayınla</button>
        </div>
      </div>

      {error && <div className="adm-note" style={{ borderColor: '#FDA29B', background: '#FEF3F2', color: '#B42318', marginBottom: 'var(--s-4)' }}><span>⚠</span><span>{error}</span></div>}
      {ok && <div className="adm-note" style={{ marginBottom: 'var(--s-4)' }}><span>✓</span><span>{ok}</span></div>}

      {/* Language tabs */}
      <div className="adm-tabs" role="tablist">
        {locales.map(l => (
          <button key={l} type="button" role="tab" aria-selected={active === l} className="adm-tab"
            onClick={() => setActive(l)}>{LOCALE_LABEL[l]}</button>
        ))}
      </div>

      <div className="adm-grid2" style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr)', gap: 'var(--s-5)' }}>
        {/* Content panel */}
        <div className="adm-panel">
          <h2 style={{ fontSize: '1rem', marginBottom: 'var(--s-3)' }}>İçerik — {LOCALE_LABEL[active]}</h2>
          <label className="field"><span className="field-lbl">Başlık</span>
            <input className="input" value={tr.title} onChange={e => onTitle(e.target.value)} /></label>
          <label className="field"><span className="field-lbl">Slug</span>
            <input className="input" value={tr.slug} onChange={e => onSlug(e.target.value)}
              onBlur={e => onSlug(normalizeSlug(e.target.value))} placeholder="ornek-yazi-slug" /></label>
          <label className="field"><span className="field-lbl">H1</span>
            <input className="input" value={tr.h1} onChange={e => setTr({ h1: e.target.value })} placeholder="(boşsa başlık kullanılır)" /></label>
          <label className="field"><span className="field-lbl">Özet (excerpt)</span>
            <textarea className="input" rows={2} value={tr.excerpt} onChange={e => setTr({ excerpt: e.target.value })} /></label>
          <label className="field"><span className="field-lbl">Kategori</span>
            <input className="input" value={tr.category} onChange={e => setTr({ category: e.target.value })} /></label>

          <h3 style={{ fontSize: '.95rem', marginTop: 'var(--s-5)' }}>Makale içeriği</h3>
          {blocks.length === 0 && <p className="muted" style={{ fontSize: '.85rem' }}>Henüz blok yok.</p>}
          {blocks.map((b, i) => (
            <BlockEditor key={i} block={b}
              onChange={nb => updateBlock(i, nb)}
              onRemove={() => removeBlock(i)}
              onMove={dir => moveBlock(i, dir)}
              onPickImage={() => setPicker({ kind: 'block', index: i })} />
          ))}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '.35rem', marginTop: 'var(--s-4)' }}>
            <button type="button" className="adm-btn adm-btn--ghost" onClick={() => addBlock('paragraph')}>+ Paragraf</button>
            <button type="button" className="adm-btn adm-btn--ghost" onClick={() => addBlock('h2')}>+ H2</button>
            <button type="button" className="adm-btn adm-btn--ghost" onClick={() => addBlock('h3')}>+ H3</button>
            <button type="button" className="adm-btn adm-btn--ghost" onClick={() => addBlock('bullets')}>+ Madde listesi</button>
            <button type="button" className="adm-btn adm-btn--ghost" onClick={() => addBlock('numbers')}>+ Numaralı liste</button>
            <button type="button" className="adm-btn adm-btn--ghost" onClick={() => addBlock('quote')}>+ Alıntı</button>
            <button type="button" className="adm-btn adm-btn--ghost" onClick={() => addBlock('image')}>+ Görsel</button>
            <button type="button" className="adm-btn adm-btn--ghost" onClick={() => addBlock('cta')}>+ CTA</button>
          </div>
        </div>

        {/* Media panel */}
        <div className="adm-panel">
          <h2 style={{ fontSize: '1rem', marginBottom: 'var(--s-3)' }}>Medya</h2>
          {post.cover?.url
            ? <img src={post.cover.url} alt={tr.coverAlt} style={{ maxWidth: 260, borderRadius: 10, display: 'block', marginBottom: '.5rem' }} />
            : <p className="muted" style={{ fontSize: '.85rem' }}>Kapak görseli seçilmedi.</p>}
          <div style={{ display: 'flex', gap: '.4rem' }}>
            <button type="button" className="adm-btn adm-btn--ghost" onClick={() => setPicker({ kind: 'cover' })}>Kapak seç</button>
            {post.cover && <button type="button" className="adm-btn adm-btn--ghost" onClick={() => setPost(p => ({ ...p, cover: null }))}>Kaldır</button>}
          </div>
          <label className="field" style={{ marginTop: 'var(--s-4)' }}><span className="field-lbl">Kapak ALT ({LOCALE_LABEL[active]})</span>
            <input className="input" value={tr.coverAlt} onChange={e => setTr({ coverAlt: e.target.value })} /></label>
        </div>

        {/* SEO panel */}
        <div className="adm-panel">
          <h2 style={{ fontSize: '1rem', marginBottom: 'var(--s-3)' }}>SEO — {LOCALE_LABEL[active]}</h2>
          <label className="field">
            <span className="field-lbl">SEO başlığı <span className={titleFlag.cls} style={{ marginLeft: '.4rem' }}>{titleFlag.txt}</span></span>
            <input className="input" value={tr.seoTitle} onChange={e => setTr({ seoTitle: e.target.value })} /></label>
          <label className="field">
            <span className="field-lbl">Meta açıklama <span className={descFlag.cls} style={{ marginLeft: '.4rem' }}>{descFlag.txt}</span></span>
            <textarea className="input" rows={2} value={tr.metaDescription} onChange={e => setTr({ metaDescription: e.target.value })} /></label>
          <label className="field"><span className="field-lbl">OG görsel override (URL)</span>
            <input className="input" value={tr.ogImage ?? ''} onChange={e => setTr({ ogImage: e.target.value || null })}
              placeholder="(boşsa: kapak → varsayılan OG)" /></label>
          <p className="muted" style={{ fontSize: '.78rem', marginTop: '.4rem' }}>
            Canonical & hreflang otomatik üretilir; düzenlenemez.
          </p>
        </div>

        {/* Warnings + delete */}
        <div className="adm-panel">
          <h2 style={{ fontSize: '1rem', marginBottom: 'var(--s-3)' }}>Yayın kontrolleri ({LOCALE_LABEL[active]})</h2>
          {warnings.length === 0
            ? <p className="muted" style={{ fontSize: '.85rem', color: '#067647' }}>Bu dil için tüm alanlar dolu.</p>
            : <ul style={{ paddingLeft: '1.1rem' }}>{warnings.map((w, i) => <li key={i} className="muted" style={{ fontSize: '.85rem', color: '#B54708' }}>{w}</li>)}</ul>}

          {post.id && (
            <div style={{ marginTop: 'var(--s-5)', borderTop: '1px solid #EAECF0', paddingTop: 'var(--s-4)' }}>
              {!confirmDelete
                ? <button type="button" className="adm-btn adm-btn--ghost" onClick={() => setConfirmDelete(true)}>Yazıyı sil</button>
                : <div style={{ display: 'flex', gap: '.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
                    <span className="muted" style={{ fontSize: '.85rem' }}>Emin misiniz? Bu işlem geri alınamaz.</span>
                    <button type="button" className="adm-btn" style={{ background: '#B42318', color: '#fff' }} disabled={saving} onClick={onDelete}>Evet, sil</button>
                    <button type="button" className="adm-btn adm-btn--ghost" onClick={() => setConfirmDelete(false)}>Vazgeç</button>
                  </div>}
            </div>
          )}
        </div>
      </div>

      {picker && (
        <MediaPicker type="image" onSelect={onPicked} onClose={() => setPicker(null)} />
      )}
    </>
  );
}
