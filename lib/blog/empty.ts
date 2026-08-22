import { locales, type Locale } from '@/i18n/config';
import type { EditableBlogPost, BlogTr } from '@/repositories/admin-blog';

// Pure (non-server-action) factory for a blank editor state. Kept out of the
// admin-blog 'use server' module, where every runtime export must be async.
const emptyTr = (): BlogTr => ({
  slug: '', title: '', h1: '', excerpt: '', category: '',
  content: [], coverAlt: '', seoTitle: '', metaDescription: '', ogImage: null,
});

export function newBlogPost(): EditableBlogPost {
  const tr = {} as Record<Locale, BlogTr>;
  for (const l of locales) tr[l] = emptyTr();
  return { id: null, status: 'draft', publishedAt: null, cover: null, tr };
}
