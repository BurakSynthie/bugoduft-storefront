import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Container, SectionHeader } from '@/components/ui';
import { isLocale, locales, type Locale } from '@/i18n/config';
import { getSettings } from '@/repositories/settings';
import { listPublishedPosts } from '@/repositories/blog';
import { buildMetadata, breadcrumbLd } from '@/lib/seo';
import { abs } from '@/config/site';
import { blogIndexAlternates, blogIndexPath, blogArticlePath } from '@/lib/blog/types';
import JsonLd from '@/seo/JsonLd';

export const dynamic = 'force-dynamic';   // published content comes from the live DB

type Params = { locale: string };

const COPY: Record<Locale, { h1: string; intro: string; empty: string; crumbHome: string; crumbBlog: string; read: string }> = {
  de: { h1: 'Blog & Wissen', intro: 'Einblicke, Anleitungen und Neuigkeiten rund um individuelle Duftanhänger.',
        empty: 'Bald erscheinen hier die ersten Artikel.', crumbHome: 'Start', crumbBlog: 'Blog', read: 'Weiterlesen' },
  en: { h1: 'Blog & Knowledge', intro: 'Insights, guides and news about custom scent tags.',
        empty: 'The first articles will appear here soon.', crumbHome: 'Home', crumbBlog: 'Blog', read: 'Read more' },
  fr: { h1: 'Blog & Connaissances', intro: 'Analyses, guides et actualités sur les désodorisants personnalisés.',
        empty: 'Les premiers articles apparaîtront bientôt ici.', crumbHome: 'Accueil', crumbBlog: 'Blog', read: 'Lire la suite' },
};

function fmtDate(iso: string | null, locale: Locale): string | null {
  if (!iso) return null;
  try { return new Date(iso).toLocaleDateString(locale === 'de' ? 'de-DE' : locale === 'fr' ? 'fr-FR' : 'en-GB',
    { year: 'numeric', month: 'long', day: 'numeric' }); } catch { return null; }
}

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const { locale: lp } = await params;
  if (!isLocale(lp)) return {};
  const locale = lp as Locale;
  const settings = await getSettings();
  const sp = settings.seo.pages.blog;
  const c = COPY[locale];
  return buildMetadata({
    locale, path: blogIndexPath(locale),
    title: sp.title[locale] || c.h1,
    description: sp.description[locale] || c.intro,
    alternates: blogIndexAlternates(),
    brand: settings.brandName || undefined,
    ogImage: sp.ogImage || settings.defaultOgImage || undefined,
  });
}

export default async function BlogIndex({ params }: { params: Promise<Params> }) {
  const { locale: lp } = await params;
  if (!isLocale(lp)) notFound();
  const locale = lp as Locale;
  const [settings, posts] = await Promise.all([getSettings(), listPublishedPosts(locale)]);
  const sp = settings.seo.pages.blog;
  const c = COPY[locale];
  const h1 = sp.h1[locale] || c.h1;
  const intro = sp.intro[locale] || c.intro;

  const crumb = breadcrumbLd([
    { name: c.crumbHome, url: abs(`/${locale}`) },
    { name: c.crumbBlog, url: abs(blogIndexPath(locale)) },
  ]);

  return (
    <section className="section">
      <JsonLd data={crumb} />
      <Container>
        <SectionHeader title={h1} lede={intro} />
        {posts.length === 0 ? (
          <div className="emptybox">{c.empty}</div>
        ) : (
          <div className="grid grid-3">
            {posts.map(p => {
              const date = fmtDate(p.publishedAt, locale);
              return (
                <Link className="card" href={blogArticlePath(locale, p.slug)} key={p.id} style={{ overflow: 'hidden' }}>
                  <div className="blogcard__media">
                    {p.coverImage ? <img src={p.coverImage} alt={p.coverAlt || p.title} loading="lazy" /> : null}
                  </div>
                  <div style={{ padding: 'var(--s-5)' }}>
                    {p.category && <span className="badge">{p.category}</span>}
                    <h3 style={{ fontSize: '1.05rem', marginTop: '.4rem' }}>{p.title}</h3>
                    {p.excerpt && <p className="muted" style={{ fontSize: '.9rem', marginTop: '.3rem' }}>{p.excerpt}</p>}
                    {date && <p className="muted" style={{ fontSize: '.8rem', marginTop: '.5rem' }}>{date}</p>}
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </Container>
    </section>
  );
}
