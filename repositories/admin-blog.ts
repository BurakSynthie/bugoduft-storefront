'use server';
import { revalidatePath } from 'next/cache';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { getAdminUser } from '@/lib/supabase/admin-auth';
import { isSupabaseConfigured } from '@/lib/supabase/env';
import { CMS_BUCKET } from '@/lib/media/types';
import { locales, type Locale } from '@/i18n/config';
import { normalizeBlocks, type BlogBlock } from '@/lib/blog/content';
import { isValidSlug, normalizeSlug, type BlogStatus } from '@/lib/blog/types';

// Admin-only Blog persistence. Every mutation re-checks getAdminUser() (in addition to RLS),
// mirroring repositories/admin-product.ts. The service-role key is never used here.

export type MediaRef = { id: string; url: string };

export type BlogTr = {
  slug: string;
  title: string;
  h1: string;
  excerpt: string;
  category: string;
  content: BlogBlock[];
  coverAlt: string;
  seoTitle: string;
  metaDescription: string;
  ogImage: string | null;
};

export type EditableBlogPost = {
  id: string | null;                 // null → new
  status: BlogStatus;
  publishedAt: string | null;
  cover: MediaRef | null;
  tr: Record<Locale, BlogTr>;
};

export type BlogListRow = {
  id: string;
  status: BlogStatus;
  publishedAt: string | null;
  updatedAt: string;
  titleDe: string;
  locales: Locale[];                 // which locales have a non-empty title/slug
  primarySlug: string;               // first available slug (de preferred)
};

export type BlogSaveResult = { ok: true; id: string } | { ok: false; message: string };
export type BlogDeleteResult = { ok: true } | { ok: false; message: string };

const emptyTr = (): BlogTr => ({
  slug: '', title: '', h1: '', excerpt: '', category: '',
  content: [], coverAlt: '', seoTitle: '', metaDescription: '', ogImage: null,
});

function pubUrl(sb: any, path: string | null): string | null {
  return path ? sb.storage.from(CMS_BUCKET).getPublicUrl(path).data.publicUrl : null;
}

export async function listBlogPosts(): Promise<BlogListRow[]> {
  if (!isSupabaseConfigured()) return [];
  const admin = await getAdminUser();
  if (!admin) return [];
  const sb = createSupabaseServerClient();
  if (!sb) return [];
  const { data, error } = await sb
    .from('blog_posts')
    .select('id, status, published_at, updated_at, blog_post_translations(locale, slug, title)')
    .order('updated_at', { ascending: false });
  if (error) return [];
  return (data ?? []).map((p: any): BlogListRow => {
    const trs: any[] = p.blog_post_translations ?? [];
    const has = (l: Locale) => trs.find(t => t.locale === l && (t.title?.trim() || t.slug?.trim()));
    const present = locales.filter(has);
    const de = trs.find(t => t.locale === 'de');
    const anyTitle = de?.title || trs.find(t => t.title)?.title || '(untitled)';
    const primarySlug = de?.slug || trs.find(t => t.slug)?.slug || '';
    return {
      id: p.id, status: p.status, publishedAt: p.published_at ?? null, updatedAt: p.updated_at,
      titleDe: anyTitle, locales: present, primarySlug,
    };
  });
}

export async function loadBlogPost(id: string): Promise<EditableBlogPost | null> {
  if (!isSupabaseConfigured()) return null;
  const admin = await getAdminUser();
  if (!admin) return null;
  const sb = createSupabaseServerClient();
  if (!sb) return null;
  const { data: p } = await sb
    .from('blog_posts')
    .select(`id, status, published_at, cover_media_id,
      cover:cover_media_id(id, storage_path),
      blog_post_translations(*)`)
    .eq('id', id).maybeSingle();
  if (!p) return null;
  const tr = {} as Record<Locale, BlogTr>;
  for (const l of locales) {
    const row = (p.blog_post_translations ?? []).find((t: any) => t.locale === l);
    tr[l] = row ? {
      slug: row.slug ?? '', title: row.title ?? '', h1: row.h1 ?? '', excerpt: row.excerpt ?? '',
      category: row.category ?? '', content: normalizeBlocks(row.content),
      coverAlt: row.cover_alt ?? '', seoTitle: row.seo_title ?? '',
      metaDescription: row.meta_description ?? '', ogImage: row.og_image ?? null,
    } : emptyTr();
  }
  const coverPath = (p as any).cover?.storage_path ?? null;
  const cover: MediaRef | null = (p as any).cover
    ? { id: (p as any).cover.id, url: pubUrl(sb, coverPath) ?? '' }
    : null;
  return { id: p.id, status: p.status as BlogStatus, publishedAt: p.published_at ?? null, cover, tr };
}

// Validate slugs across locales BEFORE writing, returning a clear admin error (never a raw
// DB error). Only locales with actual content (a title or any content) are persisted as
// translation rows; a slug is required for any such locale.
export async function saveBlogPost(input: EditableBlogPost): Promise<BlogSaveResult> {
  const admin = await getAdminUser();
  if (!admin) return { ok: false, message: 'Yetkisiz.' };
  const sb = createSupabaseServerClient();
  if (!sb) return { ok: false, message: 'Supabase yapılandırılmadı.' };

  // Determine which locales are "authored" (have any title or content).
  const authored: Locale[] = locales.filter(l => {
    const t = input.tr[l];
    return Boolean(t && (t.title.trim() || t.slug.trim() || (t.content && t.content.length)));
  });
  if (authored.length === 0) return { ok: false, message: 'En az bir dilde başlık ve slug gerekli.' };

  // Normalize + validate slugs per authored locale.
  const slugByLocale: Partial<Record<Locale, string>> = {};
  for (const l of authored) {
    const raw = input.tr[l].slug.trim() || normalizeSlug(input.tr[l].title);
    const slug = normalizeSlug(raw);
    if (!slug || !isValidSlug(slug)) {
      return { ok: false, message: `Geçersiz slug (${l.toUpperCase()}). Yalnızca küçük harf, rakam ve tire kullanın.` };
    }
    if (!input.tr[l].title.trim()) {
      return { ok: false, message: `Başlık gerekli (${l.toUpperCase()}).` };
    }
    slugByLocale[l] = slug;
  }

  // Pre-check localized slug uniqueness against OTHER posts (clear message vs raw 23505).
  for (const l of authored) {
    const slug = slugByLocale[l]!;
    const { data: clash } = await sb
      .from('blog_post_translations')
      .select('blog_post_id')
      .eq('locale', l).eq('slug', slug);
    const conflict = (clash ?? []).some((r: any) => r.blog_post_id !== input.id);
    if (conflict) return { ok: false, message: `Bu slug (${l.toUpperCase()}) zaten kullanılıyor: “${slug}”.` };
  }

  // Publishing: only set published_at when moving to published and none set yet.
  const nowIso = new Date().toISOString();
  const status: BlogStatus = input.status === 'published' ? 'published' : 'draft';
  let publishedAt: string | null = input.publishedAt;
  if (status === 'published' && !publishedAt) publishedAt = nowIso;
  if (status === 'draft') publishedAt = input.publishedAt; // keep an explicitly chosen date if present

  // Upsert the post row.
  const postPayload: Record<string, unknown> = {
    status, cover_media_id: input.cover?.id ?? null, published_at: publishedAt,
    updated_by: admin.id, updated_at: nowIso,
  };
  let postId = input.id;
  if (postId) {
    const { error } = await sb.from('blog_posts').update(postPayload).eq('id', postId);
    if (error) return { ok: false, message: error.message };
  } else {
    const { data, error } = await sb.from('blog_posts')
      .insert({ ...postPayload, created_by: admin.id }).select('id').single();
    if (error || !data) return { ok: false, message: error?.message ?? 'Kayıt oluşturulamadı.' };
    postId = data.id as string;
  }

  // Replace translation rows for authored locales; remove rows for locales no longer authored.
  const notAuthored = locales.filter(l => !authored.includes(l));
  if (notAuthored.length) {
    await sb.from('blog_post_translations').delete().eq('blog_post_id', postId).in('locale', notAuthored);
  }
  for (const l of authored) {
    const t = input.tr[l];
    const row = {
      blog_post_id: postId, locale: l, slug: slugByLocale[l]!,
      title: t.title.trim(), h1: (t.h1.trim() || t.title.trim()),
      excerpt: t.excerpt.trim(), category: t.category.trim(),
      content: normalizeBlocks(t.content),
      cover_alt: t.coverAlt.trim(), seo_title: t.seoTitle.trim(),
      meta_description: t.metaDescription.trim(), og_image: t.ogImage || null,
      updated_at: nowIso,
    };
    const { error } = await sb.from('blog_post_translations')
      .upsert(row, { onConflict: 'blog_post_id,locale' });
    if (error) {
      // Unique(locale,slug) race → friendly message.
      if ((error as any).code === '23505') return { ok: false, message: `Slug çakışması (${l.toUpperCase()}).` };
      return { ok: false, message: error.message };
    }
  }

  for (const l of locales) { revalidatePath(`/${l}/blog`); revalidatePath(`/${l}`); }
  return { ok: true, id: postId! };
}

export async function deleteBlogPost(id: string): Promise<BlogDeleteResult> {
  const admin = await getAdminUser();
  if (!admin) return { ok: false, message: 'Yetkisiz.' };
  const sb = createSupabaseServerClient();
  if (!sb) return { ok: false, message: 'Supabase yapılandırılmadı.' };
  const { error } = await sb.from('blog_posts').delete().eq('id', id); // translations cascade
  if (error) return { ok: false, message: error.message };
  for (const l of locales) { revalidatePath(`/${l}/blog`); revalidatePath(`/${l}`); }
  return { ok: true };
}
