// Blog wiring + source-safety static guards (no DB). Proves at the source level:
//   * no Blog storefront/admin file renders raw HTML (dangerouslySetInnerHTML) — the only
//     allowed sink is seo/JsonLd.tsx (schema, escaped),
//   * the public repository filters status='published' (drafts excluded) in every read,
//   * the homepage preview + sitemap consume the published Blog repository,
//   * the article page returns notFound() for a missing/draft post and marks it noindex,
//   * the Blog index SEO key is wired into the settings model + SEO admin.
// Run: tsx lib/blog/blog-wiring.test.ts
import assert from 'node:assert';
import { readFileSync } from 'node:fs';

let failures = 0;
function ok(name: string, fn: () => void) {
  try { fn(); console.log('PASS ' + name); } catch (e) { console.log('FAIL ' + name + ' — ' + (e as Error).message); failures++; }
}
const read = (p: string) => readFileSync(p, 'utf8');

ok('no dangerouslySetInnerHTML in Blog components/pages', () => {
  const files = [
    'components/blog/ArticleContent.tsx',
    'app/[locale]/blog/page.tsx',
    'app/[locale]/blog/[slug]/page.tsx',
    'app/admin/(shell)/blog/BlogEditor.tsx',
  ];
  for (const f of files) {
    // strip line comments so the word appearing in an explanatory comment doesn't false-positive
    const code = read(f).split('\n').filter(l => !l.trim().startsWith('//')).join('\n');
    assert.ok(!code.includes('dangerouslySetInnerHTML'), `${f} must not use dangerouslySetInnerHTML`);
  }
});

ok('public repository filters published in every read', () => {
  const src = read('repositories/blog.ts');
  // three reads: list, single, sitemap — each must constrain status to published
  const count = (src.match(/status['"]?,?\s*'published'|status',\s*'published'/g) || []).length;
  assert.ok(src.includes("eq('blog_posts.status', 'published')"), 'must filter published on joined post');
  assert.ok(count >= 3 || (src.match(/'published'/g) || []).length >= 3, 'published filter must appear in all reads');
});

ok('public repository never imports the service-role client', () => {
  const src = read('repositories/blog.ts');
  assert.ok(!src.includes('createSupabaseServiceClient'), 'blog repo must not use service role');
});

ok('homepage preview is wired to the published Blog repo', () => {
  const page = read('app/[locale]/page.tsx');
  assert.ok(page.includes('listPublishedPosts'), 'home page must fetch listPublishedPosts');
  assert.ok(page.includes('posts={blogPreview}'), 'BlogPreview must receive published posts');
  const extras = read('components/home/HomeExtras.tsx');
  assert.ok(extras.includes('if (!posts.length) return null'), 'preview hides when empty');
  assert.ok(extras.includes('`/${locale}/blog`'), 'View all links to /[locale]/blog');
});

ok('sitemap includes blog index + published articles, excludes drafts by construction', () => {
  const src = read('app/sitemap.ts');
  assert.ok(src.includes('blogIndexAlternates') && src.includes('blogIndexPath'), 'blog index in sitemap');
  assert.ok(src.includes('listPublishedForSitemap'), 'sitemap enumerates published posts only');
});

ok('article page returns notFound() and noindex for missing/draft post', () => {
  const src = read('app/[locale]/blog/[slug]/page.tsx');
  assert.ok(src.includes('notFound()'), 'must notFound() for missing/draft');
  assert.ok(src.includes('index: false, follow: false'), 'missing/draft metadata is noindex,nofollow');
  assert.ok(src.includes('getPublishedPostBySlug'), 'reads published-only repository');
});

ok('article page emits BlogPosting + Breadcrumb schema (no fabricated author/ratings)', () => {
  const src = read('app/[locale]/blog/[slug]/page.tsx');
  assert.ok(src.includes("'BlogPosting'"), 'BlogPosting schema present');
  assert.ok(src.includes('breadcrumbLd'), 'Breadcrumb schema present');
  assert.ok(!/['"]author['"]\s*:/.test(src), 'must not fabricate an author');
  assert.ok(!/aggregateRating|ratingValue|reviewCount/.test(src), 'must not fabricate ratings');
});

ok('Blog index SEO key wired into settings model + SEO admin', () => {
  const model = read('lib/settings/model.ts');
  assert.ok(model.includes("| 'blog'"), 'SeoPageKey includes blog');
  const keysDecl = model.slice(model.indexOf('SEO_PAGE_KEYS'));
  assert.ok(keysDecl.slice(0, 260).includes("'blog'"), 'SEO_PAGE_KEYS includes blog');
  const editor = read('app/admin/(shell)/seo/SeoEditor.tsx');
  assert.ok(editor.includes("blog:'Blog"), 'SEO editor labels blog');
  const managed = editor.slice(editor.indexOf('MANAGED_PAGES'));
  assert.ok(managed.slice(0, 260).includes("'blog'"), 'blog is a managed SEO page');
});

ok('admin nav exposes a real /admin/blog route', () => {
  const nav = read('lib/admin/nav.ts');
  assert.ok(nav.includes("href: '/admin/blog'"), 'nav has /admin/blog');
});

console.log(failures === 0 ? '\nALL BLOG WIRING TESTS PASSED' : `\n${failures} BLOG WIRING TEST(S) FAILED`);
process.exit(failures ? 1 : 0);
