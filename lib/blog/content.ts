// Safe, structured, block-based article content. We NEVER store or render arbitrary raw HTML.
// The storefront renders only the known block types below; anything else is dropped at
// normalize time, so a malformed/hostile stored value can never inject markup.

export type BlogBlock =
  | { type: 'paragraph'; text: string }
  | { type: 'h2'; text: string }
  | { type: 'h3'; text: string }
  | { type: 'bullets'; items: string[] }
  | { type: 'numbers'; items: string[] }
  | { type: 'quote'; text: string }
  | { type: 'image'; mediaId: string | null; url: string; alt: string; caption: string }
  | { type: 'cta'; label: string; href: string; external: boolean };

export const BLOG_BLOCK_TYPES = ['paragraph', 'h2', 'h3', 'bullets', 'numbers', 'quote', 'image', 'cta'] as const;
export type BlogBlockType = (typeof BLOG_BLOCK_TYPES)[number];

const str = (v: unknown): string => (typeof v === 'string' ? v : '');
const strArr = (v: unknown): string[] =>
  Array.isArray(v) ? v.map(str).map(s => s.trim()).filter(Boolean) : [];

// href guard: only allow safe schemes. Blocks javascript:, data:, etc. Relative/site-internal
// links (starting with "/") and http(s) are allowed; everything else becomes "#".
export function safeHref(raw: unknown): string {
  const s = str(raw).trim();
  if (!s) return '#';
  if (s.startsWith('/') || s.startsWith('#')) return s;
  if (/^https?:\/\//i.test(s)) return s;
  if (/^mailto:/i.test(s)) return s;
  return '#';
}

// Normalize an arbitrary stored value into a clean, known-safe block array.
// Unknown types and empty blocks are dropped — never rendered.
export function normalizeBlocks(raw: unknown): BlogBlock[] {
  if (!Array.isArray(raw)) return [];
  const out: BlogBlock[] = [];
  for (const b of raw) {
    if (!b || typeof b !== 'object') continue;
    const t = (b as { type?: unknown }).type;
    switch (t) {
      case 'paragraph': case 'h2': case 'h3': case 'quote': {
        const text = str((b as any).text).trim();
        if (text) out.push({ type: t, text });
        break;
      }
      case 'bullets': case 'numbers': {
        const items = strArr((b as any).items);
        if (items.length) out.push({ type: t, items });
        break;
      }
      case 'image': {
        const url = str((b as any).url).trim();
        if (url) out.push({
          type: 'image',
          mediaId: str((b as any).mediaId).trim() || null,
          url,
          alt: str((b as any).alt).trim(),
          caption: str((b as any).caption).trim(),
        });
        break;
      }
      case 'cta': {
        const label = str((b as any).label).trim();
        const href = safeHref((b as any).href);
        if (label && href !== '#') out.push({ type: 'cta', label, href, external: /^https?:\/\//i.test(href) });
        break;
      }
      default: /* unknown block type → dropped */ break;
    }
  }
  return out;
}

// Plain-text preview from blocks (used for excerpt fallback / meta description fallback).
export function blocksToPlainText(blocks: BlogBlock[]): string {
  const parts: string[] = [];
  for (const b of blocks) {
    if (b.type === 'paragraph' || b.type === 'h2' || b.type === 'h3' || b.type === 'quote') parts.push(b.text);
    else if (b.type === 'bullets' || b.type === 'numbers') parts.push(b.items.join(' '));
  }
  return parts.join(' ').replace(/\s+/g, ' ').trim();
}
