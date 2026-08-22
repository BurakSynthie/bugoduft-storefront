// Blog logic regression tests (no DB): safe content model, slug rules, hreflang alternates,
// and metadata canonical/hreflang wiring via buildMetadata. Run: tsx lib/blog/blog.test.ts
import assert from 'node:assert';
import { normalizeBlocks, blocksToPlainText, safeHref } from '@/lib/blog/content';
import { normalizeSlug, isValidSlug, blogAlternates, blogIndexAlternates, blogArticlePath, blogIndexPath } from '@/lib/blog/types';
import { buildMetadata } from '@/lib/seo';
import { abs } from '@/config/site';

let failures = 0;
function ok(name: string, fn: () => void) {
  try { fn(); console.log('PASS ' + name); } catch (e) { console.log('FAIL ' + name + ' — ' + (e as Error).message); failures++; }
}

// ---- SAFE CONTENT MODEL: unknown/hostile blocks dropped, no raw HTML path ----
ok('normalizeBlocks drops unknown block types', () => {
  const out = normalizeBlocks([
    { type: 'script', text: '<script>alert(1)</script>' },
    { type: 'html', text: '<img onerror=x>' },
    { type: 'paragraph', text: 'safe' },
  ]);
  assert.equal(out.length, 1);
  assert.equal(out[0].type, 'paragraph');
});

ok('normalizeBlocks keeps text VERBATIM as data (never parsed as HTML)', () => {
  // The sanitizer keeps text content as-is; safety comes from React text rendering (no
  // dangerouslySetInnerHTML). We assert the value is preserved as a plain string field.
  const out = normalizeBlocks([{ type: 'paragraph', text: '<b>bold</b> & <i>' }]);
  assert.equal(out.length, 1);
  assert.equal((out[0] as any).text, '<b>bold</b> & <i>');   // stored as literal text, rendered as text
});

ok('normalizeBlocks drops empty blocks and empty list items', () => {
  const out = normalizeBlocks([
    { type: 'paragraph', text: '   ' },
    { type: 'bullets', items: ['', '  ', 'a'] },
    { type: 'h2', text: '' },
  ]);
  assert.equal(out.length, 1);
  assert.equal(out[0].type, 'bullets');
  assert.deepEqual((out[0] as any).items, ['a']);
});

ok('safeHref blocks javascript: and data: schemes', () => {
  assert.equal(safeHref('javascript:alert(1)'), '#');
  assert.equal(safeHref('data:text/html,x'), '#');
  assert.equal(safeHref('/de/produkte'), '/de/produkte');
  assert.equal(safeHref('https://example.com'), 'https://example.com');
  assert.equal(safeHref('mailto:a@b.com'), 'mailto:a@b.com');
});

ok('cta with unsafe href is dropped by normalizeBlocks', () => {
  const out = normalizeBlocks([{ type: 'cta', label: 'x', href: 'javascript:1' }]);
  assert.equal(out.length, 0);
});

ok('blocksToPlainText builds a preview string', () => {
  const txt = blocksToPlainText(normalizeBlocks([
    { type: 'h2', text: 'Title' }, { type: 'paragraph', text: 'Body here.' },
    { type: 'bullets', items: ['one', 'two'] },
  ]));
  assert.ok(txt.includes('Title') && txt.includes('Body here.') && txt.includes('one'));
});

// ---- SLUG rules ----
ok('normalizeSlug produces URL-safe slugs', () => {
  assert.equal(normalizeSlug('Über BUGO Düfte!'), 'ueber-bugo-duefte');
  assert.equal(normalizeSlug('  Hello   World  '), 'hello-world');
  assert.equal(normalizeSlug('Café & Straße'), 'cafe-strasse');
});
ok('isValidSlug accepts clean slugs and rejects junk', () => {
  assert.ok(isValidSlug('my-article-1'));
  assert.ok(!isValidSlug('My Article'));
  assert.ok(!isValidSlug('-leading'));
  assert.ok(!isValidSlug('trailing-'));
  assert.ok(!isValidSlug(''));
});

// ---- ALTERNATES / hreflang ----
ok('blogAlternates only includes locales that exist', () => {
  const alt = blogAlternates({ de: 'de-slug', en: 'en-slug' });   // fr missing
  assert.deepEqual(alt, { de: '/de/blog/de-slug', en: '/en/blog/en-slug' });
  assert.equal((alt as any).fr, undefined);
});
ok('blogIndexAlternates is slug-stable across all locales', () => {
  const alt = blogIndexAlternates();
  assert.deepEqual(alt, { de: '/de/blog', en: '/en/blog', fr: '/fr/blog' });
});

// ---- METADATA canonical + hreflang wiring ----
ok('buildMetadata self-canonical + reciprocal hreflang for an article', () => {
  const slugs = { de: 'de-slug', en: 'en-slug' };
  const md = buildMetadata({
    locale: 'en', path: blogArticlePath('en', 'en-slug'),
    title: 'T', description: 'D', alternates: blogAlternates(slugs), ogType: 'article',
  });
  assert.equal((md.alternates as any).canonical, abs('/en/blog/en-slug'));
  const langs = (md.alternates as any).languages as Record<string, string>;
  assert.equal(langs['de-DE'], abs('/de/blog/de-slug'));
  assert.equal(langs['en'], abs('/en/blog/en-slug'));
  assert.equal(langs['x-default'], abs('/de/blog/de-slug'));  // x-default → German source
  assert.equal(langs['fr'], undefined);                        // fr translation does not exist
  assert.equal((md.openGraph as any).type, 'article');
});

ok('blog index metadata canonical self-references the locale', () => {
  const md = buildMetadata({
    locale: 'fr', path: blogIndexPath('fr'), title: 'Blog', description: 'x',
    alternates: blogIndexAlternates(),
  });
  assert.equal((md.alternates as any).canonical, abs('/fr/blog'));
  const langs = (md.alternates as any).languages as Record<string, string>;
  assert.equal(langs['x-default'], abs('/de/blog'));
});

console.log(failures === 0 ? '\nALL BLOG LOGIC TESTS PASSED' : `\n${failures} BLOG LOGIC TEST(S) FAILED`);
process.exit(failures ? 1 : 0);
