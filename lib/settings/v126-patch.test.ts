// §v1.2.6 — regression tests for the v1.2.6 patch (SEO + admin layout stability).
// PURE: never imported by production. Mixes behavioral checks (websiteLd, routing) with static
// source scans (readFileSync) for the structural invariants the patch depends on — chosen because
// the admin duplication root-cause is a document/layout-ownership property that is best asserted
// structurally, and because rendering React components needs a full runtime.
//
// Run with:  tsx lib/settings/v126-patch.test.ts
import { readFileSync, existsSync } from 'node:fs';
import { websiteLd, organizationLd } from '../seo';
import { seg, sectionPath } from '../routing';
import { locales } from '@/i18n/config';

let failures = 0;
function expect(label: string, got: unknown, want: unknown) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) failures++;
  // eslint-disable-next-line no-console
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}: got ${JSON.stringify(got)} want ${JSON.stringify(want)}`);
}
function assert(label: string, cond: boolean) {
  if (!cond) failures++;
  // eslint-disable-next-line no-console
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${label}`);
}
const read = (p: string) => readFileSync(p, 'utf8');

// =============================================================================================
// A2 — WebSite JSON-LD is correct, and Organization schema is unchanged (both must coexist).
// =============================================================================================
const wl = websiteLd({ brand: 'BUGO DUFT' }) as Record<string, unknown>;
expect('websiteLd @type is WebSite', wl['@type'], 'WebSite');
expect('websiteLd name is BUGO DUFT', wl.name, 'BUGO DUFT');
expect('websiteLd url is canonical site URL', wl.url, 'https://bugoduft.de');
expect('websiteLd @context', wl['@context'], 'https://schema.org');
const ol = organizationLd({ brand: 'BUGO DUFT' }) as Record<string, unknown>;
expect('organizationLd still @type Organization', ol['@type'], 'Organization');

// =============================================================================================
// A3/A6 — Production is a real localized route in the CENTRAL seg map (not a second router).
// =============================================================================================
assert('seg.production exists', Boolean((seg as Record<string, unknown>).production));
expect('sectionPath production DE', sectionPath('production', 'de'), '/de/produktion');
expect('sectionPath production EN', sectionPath('production', 'en'), '/en/production');
expect('sectionPath production FR', sectionPath('production', 'fr'), '/fr/production');
assert('all locales have a production segment', locales.every(l => Boolean(seg.production[l])));

// =============================================================================================
// D — DOCUMENT / LAYOUT OWNERSHIP (root cause of the admin DOM duplication).
//   Exactly the two branch layouts own <html>/<body>; the invalid pass-through root is gone;
//   not-found no longer renders a second document.
// =============================================================================================
assert('invalid pass-through app/layout.tsx is REMOVED', !existsSync('app/layout.tsx'));
assert('storefront root layout owns <html>', read('app/[locale]/layout.tsx').includes('<html'));
assert('storefront root layout owns <body>', read('app/[locale]/layout.tsx').includes('<body>'));
assert('admin root layout owns <html>', read('app/admin/layout.tsx').includes('<html'));
assert('admin root layout owns <body>', read('app/admin/layout.tsx').includes('<body>'));
assert('[locale]/not-found.tsx exists', existsSync('app/[locale]/not-found.tsx'));
assert('[locale]/not-found.tsx does NOT render its own <html>', !read('app/[locale]/not-found.tsx').includes('<html'));
assert('old top-level app/not-found.tsx is removed', !existsSync('app/not-found.tsx'));

// =============================================================================================
// D2 — ADMIN ROUTE OWNERSHIP: each admin page renders ONLY its own editor.
//   SeoEditor lives ONLY under /admin/seo; Blog/Home/Settings editors never import SeoEditor.
// =============================================================================================
const seoPage = read('app/admin/(shell)/seo/page.tsx');
assert('SeoEditor is rendered by /admin/seo', seoPage.includes('SeoEditor'));
const blogEdit = read('app/admin/(shell)/blog/[id]/page.tsx');
assert('BlogEditor page imports BlogEditor', blogEdit.includes('BlogEditor'));
assert('BlogEditor page does NOT import SeoEditor', !blogEdit.includes('SeoEditor'));
const blogNew = read('app/admin/(shell)/blog/yeni/page.tsx');
assert('New BlogEditor does NOT import SeoEditor', !blogNew.includes('SeoEditor'));
const homePage = read('app/admin/(shell)/ana-sayfa/page.tsx');
assert('HomeEditor page imports HomeEditor', homePage.includes('HomeEditor'));
assert('HomeEditor page does NOT import SeoEditor', !homePage.includes('SeoEditor'));
const settingsPage = read('app/admin/(shell)/ayarlar/page.tsx');
assert('SettingsEditor page imports SettingsEditor', settingsPage.includes('SettingsEditor'));
assert('SettingsEditor page does NOT import SeoEditor', !settingsPage.includes('SeoEditor'));

// =============================================================================================
// D3 — §v1.2.6-final2 SeoEditor REACT KEY IDENTITY (root cause of the "typing appends DOM
//   nodes" symptom). field() (SEO panel) and indBlock() (industry visible-content panel) are
//   rendered for the SAME page keys (autohaus/werkstatt) as siblings. Keying both by the bare
//   page key made two different sibling panels share key="autohaus"/key="werkstatt" — invalid
//   React identity, so a controlled-input state update on each keystroke reconciled wrongly and
//   accumulated DOM. Assert the two panel factories now use DISTINCT, STABLE, namespaced keys.
// =============================================================================================
const seoEditorSrc = read('app/admin/(shell)/seo/SeoEditor.tsx');
// The SEO panel (field) is keyed `seo-page-<k>`; the industry visible panel (indBlock) is
// keyed `industry-visible-<k>`. Both namespaces must be present and derived from the page key.
assert('SeoEditor field() uses stable unique key seo-page-<k>', /key=\{`seo-page-\$\{k\}`\}/.test(seoEditorSrc));
assert('SeoEditor indBlock() uses stable unique key industry-visible-<k>', /key=\{`industry-visible-\$\{k\}`\}/.test(seoEditorSrc));
// The old ambiguous bare `key={k}` (shared across the two different panels) must be gone.
assert('SeoEditor no longer keys a panel by the bare page key (key={k})', !/key=\{k\}/.test(seoEditorSrc));
// Keys must be stable — never random, index- or time-based (would break reconciliation too).
assert('SeoEditor keys are not Math.random / index / timestamp based',
  !/key=\{[^}]*Math\.random/.test(seoEditorSrc) &&
  !/key=\{[^}]*Date\.now/.test(seoEditorSrc) &&
  !/key=\{i\}/.test(seoEditorSrc) && !/key=\{idx\}/.test(seoEditorSrc));
// The four panels that coexist for the two industry pages must resolve to four DISTINCT ids.
const industryKeys = ['autohaus', 'werkstatt'].flatMap(k => [`seo-page-${k}`, `industry-visible-${k}`]);
assert('the two SEO panels + two industry visible panels have 4 distinct stable identities',
  new Set(industryKeys).size === 4);
// And the two namespaces never collide with each other for any shared key.
assert('seo-page-* and industry-visible-* namespaces never collide',
  ['autohaus', 'werkstatt'].every(k => `seo-page-${k}` !== `industry-visible-${k}`));

// =============================================================================================
// A1/A2 — SITEMAP + homepage schema wiring (static scan; sitemap.ts pulls DB repos at runtime).
// =============================================================================================
const sm = read('app/sitemap.ts');
assert('sitemap includes the Production page', sm.includes("sectionAlternates('production')"));
assert('sitemap includes About + B2B info pages', sm.includes("'about','b2b'"));
const homeSrc = read('app/[locale]/page.tsx');
assert('homepage emits exactly one WebSite entity (websiteLd used once)',
  (homeSrc.match(/websiteLd\(/g) || []).length === 1);
assert('homepage still emits Organization schema', homeSrc.includes('organizationLd('));

// =============================================================================================
// A6 — internal linking: central nav + footer + mobile menu point Produktion to the real page.
// =============================================================================================
assert('central nav points production to sectionPath', read('app/[locale]/layout.tsx').includes("sectionPath('production', locale)"));
assert('footer points production to sectionPath', read('components/layout/Footer.tsx').includes("sectionPath('production', locale)"));
// Homepage #produktion section MUST remain.
assert('homepage #produktion section preserved', read('components/home/HomeExtras.tsx').includes('id="produktion"'));

// =============================================================================================
// B — single hero video instance (no duplicate desktop+mobile copy): Hero renders HeroMedia once.
// =============================================================================================
const hero = read('components/home/Hero.tsx');
assert('hero renders a single HeroMedia (one video instance)',
  (hero.match(/<HeroMedia\b/g) || []).length === 1);
assert('hero preserves a semantic <h1>', hero.includes('<h1'));

// ---------------------------------------------------------------------------------------------
// eslint-disable-next-line no-console
console.log(failures === 0 ? '\nALL v1.2.6 PATCH TESTS PASSED' : `\n${failures} v1.2.6 PATCH TEST(S) FAILED`);
if (failures > 0) process.exit(1);
