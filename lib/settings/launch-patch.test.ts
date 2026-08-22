// Final targeted-launch-patch regression tests. PURE — never imported by production code.
// Run with:  tsx lib/settings/launch-patch.test.ts
//
// Same static-source-assertion style as wiring.test.ts: each reads the actual source file and
// fails if a concrete launch fix regresses. Scope is ONLY the four targeted launch tasks
// (OG fallback asset, account/auth noindex, view_product / begin_checkout / SPA pageview wiring,
// and the client-side Purchase guard). No behavior is re-implemented; the wiring seam is checked.
import { readFileSync, existsSync } from 'node:fs';

let failures = 0;
function ok(label: string, cond: boolean) {
  if (!cond) failures++;
  // eslint-disable-next-line no-console
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${label}`);
}
const read = (p: string) => readFileSync(p, 'utf8');

// ---------------- TASK 1 — default OG fallback asset actually exists ----------------
// config/site.ts references /og/bugoduft-default.png; the file must exist under public/ so
// metadata never points at a 404. The fallback chain / metadata code is intentionally unchanged.
const site = read('config/site.ts');
const ogRef = site.match(/defaultOgImage:\s*'([^']+)'/)?.[1] ?? '';
ok('site.defaultOgImage points at /og/bugoduft-default.png', ogRef === '/og/bugoduft-default.png');
ok('referenced default OG asset exists in public/', ogRef.startsWith('/') && existsSync('public' + ogRef));

// ---------------- TASK 2 — account/auth area is noindex at the nearest shared layout ----------------
const kontoLayout = 'app/[locale]/konto/layout.tsx';
ok('konto shared layout exists', existsSync(kontoLayout));
const kl = existsSync(kontoLayout) ? read(kontoLayout) : '';
ok('konto layout sets robots index:false', /robots:\s*\{[^}]*index:\s*false/.test(kl));
ok('konto layout sets robots follow:false', /robots:\s*\{[^}]*follow:\s*false/.test(kl));
ok('konto layout is a passthrough (returns a fragment; parent locale layout owns <html>/<body>)',
  /return\s*<>\{children\}<\/>/.test(kl.replace(/\/\/[^\n]*/g, '')));
// Public metadata must remain indexable by default (buildMetadata defaults index/follow to true).
const seoSrc = read('lib/seo.ts');
ok('public pages default to index:true / follow:true', /index:\s*a\.index\s*\?\?\s*true/.test(seoSrc) && /follow:\s*a\.follow\s*\?\?\s*true/.test(seoSrc));

// ---------------- TASK 3A — view_product fired once via the consent-aware abstraction ----------------
const tpv = 'components/product/TrackProductView.tsx';
ok('TrackProductView component exists', existsSync(tpv));
const tpvSrc = existsSync(tpv) ? read(tpv) : '';
ok('TrackProductView emits view_product via window.bugoTrack', /window\.bugoTrack\?\.\('view_product'/.test(tpvSrc));
ok('TrackProductView guards against double-fire (ref keyed on slug)', /firedFor\.current/.test(tpvSrc));
const slugPage = read('app/[locale]/[...slug]/page.tsx');
ok('product detail page mounts TrackProductView', /<TrackProductView\b/.test(slugPage));
ok('TrackProductView only in the product branch (keyed by product slug)', /<TrackProductView[\s\S]*slug=\{p\.slug\}/.test(slugPage));

// ---------------- TASK 3B — begin_checkout fired at the real checkout boundary, deduped ----------------
const cart = read('components/storefront/CartDrawer.tsx');
ok('CartDrawer emits begin_checkout via window.bugoTrack', /window\.bugoTrack\?\.\('begin_checkout'/.test(cart));
ok('begin_checkout fires only after a successful checkout URL (res.ok), before redirect',
  /if\s*\(res\.ok\)\s*\{[\s\S]*begin_checkout[\s\S]*window\.location\.href\s*=\s*res\.url/.test(cart));
ok('begin_checkout is deduped per cart item (no rerender/retry double-fire)',
  /beganCheckout\.current\.has\(item\.cartItemId\)/.test(cart) && /beganCheckout\.current\.add\(item\.cartItemId\)/.test(cart));
ok('analytics call is wrapped so it can never block checkout', /try\s*\{\s*window\.bugoTrack\?\.\('begin_checkout'[\s\S]*\}\s*catch/.test(cart));

// ---------------- TASK 3C — route-aware SPA PageView, GTM-mode & first-load safe ----------------
const ra = 'components/layout/RouteAnalytics.tsx';
ok('RouteAnalytics component exists', existsSync(ra));
const raSrc = existsSync(ra) ? read(ra) : '';
ok('RouteAnalytics tracks client navigation via usePathname', /usePathname/.test(raSrc));
ok('RouteAnalytics skips the initial load (records first path, no fire)', /lastPath\.current === null/.test(raSrc));
ok('RouteAnalytics fires GA4 page_view ONLY in direct mode (GTM owns it otherwise)',
  /analyticsMode === 'direct'[\s\S]*page_view/.test(raSrc));
ok('RouteAnalytics reads consent live before firing', /readConsent\(\)/.test(raSrc));
const localeLayout = read('app/[locale]/layout.tsx');
ok('locale layout mounts RouteAnalytics with analyticsMode', /<RouteAnalytics\s+analyticsMode=\{settings\.integrations\.analyticsMode\}/.test(localeLayout));

// ---------------- TASK 4 — Purchase must NEVER be fired client-side ----------------
const analytics = read('components/layout/Analytics.tsx');
ok('bugoTrack refuses purchase client-side (payment webhook is the truth)',
  /if\s*\(event === 'purchase'\)\s*return/.test(analytics));
// No client-side purchase event was invented anywhere in the app surface.
for (const f of [slugPage, cart, tpvSrc, raSrc, localeLayout]) {
  ok('no invented client-side purchase event in patched file',
    !/bugoTrack\?\.\('purchase'/.test(f) && !/fbq\(['"]track['"],\s*['"]Purchase['"]\)/.test(f));
}

// eslint-disable-next-line no-console
console.log(failures === 0 ? '\nALL LAUNCH-PATCH TESTS PASSED' : `\n${failures} LAUNCH-PATCH TEST(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
