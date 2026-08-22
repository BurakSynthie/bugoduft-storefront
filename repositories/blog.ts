import 'server-only';
import type { Locale } from '@/i18n/config';
import { locales } from '@/i18n/config';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { supabaseEnv, isSupabaseConfigured } from '@/lib/supabase/env';
import { normalizeBlocks } from '@/lib/blog/content';
import type { BlogArticleView, BlogCard } from '@/lib/blog/types';

// PUBLIC storefront reads. RLS already restricts anon to published posts, but we ALSO
// filter status='published' in every query as defence-in-depth so a draft can never leak
// through the public repository layer even if a policy were relaxed. Never uses the
// service-role client.

const CMS = 'cms-media';
function mediaUrl(path: string | null | undefined): string | null {
  return path ? `${supabaseEnv.url}/storage/v1/object/public/${CMS}/${path}` : null;
}

function db() { return isSupabaseConfigured() ? createSupabaseServerClient() : null; }

// List published article CARDS for a locale (newest first).
export async function listPublishedPosts(locale: Locale, limit?: number): Promise<BlogCard[]> {
  const sb = db();
  if (!sb) return [];
  try {
    let query = sb
      .from('blog_post_translations')
      .select(`slug, title, excerpt, category, cover_alt,
        blog_posts!inner(id, status, published_at, cover:cover_media_id(storage_path))`)
      .eq('locale', locale)
      .eq('blog_posts.status', 'published')                     // defence-in-depth
      .order('published_at', { ascending: false, foreignTable: 'blog_posts' });
    if (limit && limit > 0) query = query.limit(limit);
    const { data, error } = await query;
    if (error) return [];
    return (data ?? []).map((r: any): BlogCard => ({
      id: r.blog_posts.id,
      slug: r.slug,
      title: r.title,
      excerpt: r.excerpt,
      category: r.category,
      coverImage: mediaUrl(r.blog_posts.cover?.storage_path),
      coverAlt: r.cover_alt || '',
      publishedAt: r.blog_posts.published_at ?? null,
    }));
  } catch { return []; }
}

// Single published article by localized slug. Returns null for drafts / missing slugs
// (→ storefront notFound()), so a guessed draft slug is never publicly rendered.
export async function getPublishedPostBySlug(locale: Locale, slug: string): Promise<BlogArticleView | null> {
  const sb = db();
  if (!sb) return null;
  try {
    const { data, error } = await sb
      .from('blog_post_translations')
      .select(`slug, title, h1, excerpt, category, content, cover_alt, seo_title, meta_description, og_image,
        blog_posts!inner(id, status, published_at, updated_at, cover:cover_media_id(storage_path))`)
      .eq('locale', locale).eq('slug', slug)
      .eq('blog_posts.status', 'published')                     // defence-in-depth
      .maybeSingle();
    if (error || !data) return null;
    const post: any = (data as any).blog_posts;
    if (!post || post.status !== 'published') return null;

    // Collect the localized slugs that ACTUALLY exist for this post (for hreflang).
    const slugs: Partial<Record<Locale, string>> = {};
    const { data: trs } = await sb
      .from('blog_post_translations')
      .select('locale, slug, blog_posts!inner(status)')
      .eq('blog_post_id', post.id)
      .eq('blog_posts.status', 'published');
    for (const t of (trs ?? []) as any[]) {
      if ((locales as readonly string[]).includes(t.locale)) slugs[t.locale as Locale] = t.slug;
    }

    return {
      id: post.id,
      status: 'published',
      locale,
      slug: (data as any).slug,
      title: (data as any).title,
      h1: (data as any).h1 || (data as any).title,
      excerpt: (data as any).excerpt || '',
      category: (data as any).category || '',
      content: normalizeBlocks((data as any).content),
      coverImage: mediaUrl(post.cover?.storage_path),
      coverAlt: (data as any).cover_alt || '',
      seoTitle: (data as any).seo_title || '',
      metaDescription: (data as any).meta_description || '',
      ogImage: (data as any).og_image || null,
      publishedAt: post.published_at ?? null,
      updatedAt: post.updated_at,
      slugs,
    };
  } catch { return null; }
}

// Enumerate published translations for the sitemap: one entry per (post) with the localized
// slugs that exist and a lastModified. Drafts are excluded by the status filter.
export async function listPublishedForSitemap(): Promise<
  { id: string; slugs: Partial<Record<Locale, string>>; lastModified: string }[]
> {
  const sb = db();
  if (!sb) return [];
  try {
    const { data, error } = await sb
      .from('blog_post_translations')
      .select(`locale, slug, blog_posts!inner(id, status, published_at, updated_at)`)
      .eq('blog_posts.status', 'published');
    if (error) return [];
    const byPost = new Map<string, { id: string; slugs: Partial<Record<Locale, string>>; lastModified: string }>();
    for (const r of (data ?? []) as any[]) {
      const p = r.blog_posts;
      if (!p || p.status !== 'published') continue;
      const entry: { id: string; slugs: Partial<Record<Locale, string>>; lastModified: string } =
        byPost.get(p.id) ?? { id: p.id, slugs: {}, lastModified: p.updated_at || p.published_at || '' };
      if ((locales as readonly string[]).includes(r.locale)) entry.slugs[r.locale as Locale] = r.slug;
      const lm = p.updated_at || p.published_at || '';
      if (lm > entry.lastModified) entry.lastModified = lm;
      byPost.set(p.id, entry);
    }
    return Array.from(byPost.values());
  } catch { return []; }
}
