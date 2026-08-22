import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Container } from '@/components/ui';
import { isLocale, type Locale } from '@/i18n/config';
import { getSettings } from '@/repositories/settings';
import { getPublishedPostBySlug } from '@/repositories/blog';
import { buildMetadata, breadcrumbLd } from '@/lib/seo';
import { site, abs } from '@/config/site';
import { blogIndexPath, blogArticlePath, blogAlternates } from '@/lib/blog/types';
import { blocksToPlainText } from '@/lib/blog/content';
import ArticleContent from '@/components/blog/ArticleContent';
import JsonLd from '@/seo/JsonLd';

export const dynamic = 'force-dynamic';   // published content comes from the live DB

type Params = { locale: string; slug: string };

const COPY: Record<Locale, { home: string; blog: string; back: string }> = {
  de: { home: 'Start', blog: 'Blog', back: '← Zurück zum Blog' },
  en: { home: 'Home', blog: 'Blog', back: '← Back to blog' },
  fr: { home: 'Accueil', blog: 'Blog', back: '← Retour au blog' },
};

function fmtDate(iso: string | null, locale: Locale): string | null {
  if (!iso) return null;
  try { return new Date(iso).toLocaleDateString(locale === 'de' ? 'de-DE' : locale === 'fr' ? 'fr-FR' : 'en-GB',
    { year: 'numeric', month: 'long', day: 'numeric' }); } catch { return null; }
}

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const { locale: lp, slug } = await params;
  if (!isLocale(lp)) return {};
  const locale = lp as Locale;
  const post = await getPublishedPostBySlug(locale, slug);
  if (!post) return { robots: { index: false, follow: false } };   // draft/missing → not indexable
  const settings = await getSettings();
  const brand = settings.brandName || undefined;
  const descFallback = post.excerpt || blocksToPlainText(post.content).slice(0, 160);
  const ogImage = post.ogImage || post.coverImage || settings.defaultOgImage || undefined;
  return buildMetadata({
    locale, path: blogArticlePath(locale, post.slug),
    title: post.seoTitle || post.title,
    description: post.metaDescription || descFallback,
    alternates: blogAlternates(post.slugs),
    ogType: 'article',
    ogImage,
    brand,
  });
}

export default async function BlogArticle({ params }: { params: Promise<Params> }) {
  const { locale: lp, slug } = await params;
  if (!isLocale(lp)) notFound();
  const locale = lp as Locale;
  const post = await getPublishedPostBySlug(locale, slug);
  if (!post) notFound();                                            // guessed draft slug → 404
  const settings = await getSettings();
  const c = COPY[locale];
  const date = fmtDate(post.publishedAt, locale);
  const canonical = abs(blogArticlePath(locale, post.slug));

  const crumb = breadcrumbLd([
    { name: c.home, url: abs(`/${locale}`) },
    { name: c.blog, url: abs(blogIndexPath(locale)) },
    { name: post.h1 || post.title, url: canonical },
  ]);

  // BlogPosting schema — only real, available properties (no fabricated author/ratings).
  const ogImageAbs = post.ogImage
    ? (post.ogImage.startsWith('http') ? post.ogImage : abs(post.ogImage))
    : (post.coverImage || (settings.defaultOgImage ? abs(settings.defaultOgImage) : null));
  const blogPosting: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'BlogPosting',
    headline: post.seoTitle || post.title,
    description: post.metaDescription || post.excerpt || blocksToPlainText(post.content).slice(0, 200),
    mainEntityOfPage: canonical,
    url: canonical,
    inLanguage: locale,
    publisher: { '@type': 'Organization', name: settings.brandName || site.name, url: site.url },
  };
  if (ogImageAbs) blogPosting.image = ogImageAbs;
  if (post.publishedAt) blogPosting.datePublished = post.publishedAt;
  if (post.updatedAt) blogPosting.dateModified = post.updatedAt;

  return (
    <section className="section">
      <JsonLd data={[crumb, blogPosting]} />
      <Container>
        <article style={{ maxWidth: '72ch', margin: '0 auto' }}>
          <nav className="muted" style={{ fontSize: '.85rem', marginBottom: 'var(--s-4)' }} aria-label="Breadcrumb">
            <Link href={`/${locale}`}>{c.home}</Link>
            <span aria-hidden="true"> / </span>
            <Link href={blogIndexPath(locale)}>{c.blog}</Link>
            <span aria-hidden="true"> / </span>
            <span>{post.h1 || post.title}</span>
          </nav>

          {post.category && <span className="badge">{post.category}</span>}
          <h1 style={{ marginTop: post.category ? '.5rem' : 0 }}>{post.h1 || post.title}</h1>
          {date && <p className="muted" style={{ fontSize: '.85rem', marginTop: '.5rem' }}>{date}</p>}

          {post.coverImage && (
            <img src={post.coverImage} alt={post.coverAlt || post.title} loading="eager"
              style={{ width: '100%', height: 'auto', borderRadius: '14px', margin: 'var(--s-5) 0' }} />
          )}

          <ArticleContent blocks={post.content} />

          <div style={{ marginTop: 'var(--s-7)' }}>
            <Link className="btn btn--ghost" href={blogIndexPath(locale)}>{c.back}</Link>
          </div>
        </article>
      </Container>
    </section>
  );
}
