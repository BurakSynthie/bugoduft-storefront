// Round-2 launch wiring regression tests. PURE — never imported by production code.
// Run with:  tsx lib/settings/wiring.test.ts
//
// These are STATIC SOURCE assertions: each reads the actual source file and fails if a
// concrete wiring fix regresses. They intentionally check the wiring seam (the exact call /
// prop / field that must exist) rather than re-implementing behavior, so a future edit that
// silently drops the wiring turns the test red. Plus unit checks for pure helpers.
import { readFileSync } from 'node:fs';
import { organizationLd } from '../seo';
import { defaultSettings } from './model';

let failures = 0;
function ok(label: string, cond: boolean) {
  if (!cond) failures++;
  // eslint-disable-next-line no-console
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${label}`);
}
const read = (p: string) => readFileSync(p, 'utf8');

// ---------------- §1 brand.logo consumed by Header AND Footer ----------------
const header = read('components/layout/Header.tsx');
ok('Header accepts brandLogo prop', /brandLogo/.test(header));
ok('Header renders logo <img> with brand alt', /brandLogo\s*\n?\s*\?\s*<img[^>]*alt=\{brandLabel\}/.test(header) || (/brandLogo/.test(header) && /logo__img/.test(header) && /alt=\{brandLabel\}/.test(header)));
const footer = read('components/layout/Footer.tsx');
ok('Footer renders brand.logo <img> when present', /settings\?\.brand\.logo/.test(footer) && /logo__img/.test(footer));
const layout = read('app/[locale]/layout.tsx');
ok('layout passes brandLogo to Header', /brandLogo=\{settings\.brand\.logo\}/.test(layout));

// ---------------- §2 industry overrides matched by STABLE key (not localized slug) ----------
const slugPage = read('app/[locale]/[...slug]/page.tsx');
const industriesRepo = read('repositories/industries.ts');

ok('industry override uses stable autohaeuser key in unified reader',
  /key === 'autohaeuser'/.test(industriesRepo) &&
  /return 'autohaus'/.test(industriesRepo) &&
  /getIndustryBySlugRead/.test(slugPage));

ok('industry override uses stable werkstaetten key in unified reader',
  /key === 'werkstaetten'/.test(industriesRepo) &&
  /return 'werkstatt'/.test(industriesRepo) &&
  /getIndustryBySlugRead/.test(slugPage));

// ---------------- §3 About/B2B SEO wired; Sample H1/intro wired; Home no fake H1/intro; Production managed -------
const infoPage = read('app/[locale]/info/[slug]/page.tsx');
ok('About/B2B use buildMetadata (brand-aware, auto canonical/hreflang)', /buildMetadata/.test(infoPage) && /SEO_INFO_SLUGS/.test(infoPage));
ok('About/B2B consume seo.pages[key] title/description', /settings\.seo\.pages\[seoKey\]/.test(infoPage));
ok('Sample page receives admin H1/intro', /h1=\{spSeo\.h1\[locale\]/.test(slugPage) && /intro=\{spSeo\.intro\[locale\]/.test(slugPage));
const sampleC = read('components/storefront/SamplePage.tsx');
ok('SamplePage renders admin h1/intro override', /h1 \|\| t\.title/.test(sampleC) && /intro \|\| t\.lede/.test(sampleC));
const seoEditor = read('app/admin/(shell)/seo/SeoEditor.tsx');
// §v1.2.6-final2: Production is now a real localized route (/de/produktion etc.) with an
// existing settings.seo.pages.production model, so the SEO center MANAGES it (no longer hidden).
ok('SEO center includes production as a managed page', /MANAGED_PAGES[^\n]*'production'/.test(seoEditor));
ok('SEO center: Production exposes H1/intro (HAS_INTRO)', /HAS_INTRO[^\n]*'production'/.test(seoEditor));
ok('Production page metadata overrides from settings.seo.pages.production', /pp\.title\[locale\] \|\| PRODUCTION_COPY\[locale\]\.title/.test(slugPage));
ok('Production visible H1/intro override from settings.seo.pages.production', /pp\.h1\[locale\] \|\| PRODUCTION_COPY\[locale\]\.h1/.test(slugPage) && /ProductionLanding locale=\{locale\} h1=\{h1\} intro=\{intro\}/.test(slugPage));
ok('SEO center: Home excluded from H1/intro (HAS_INTRO)', !/HAS_INTRO[^\n]*'home'/.test(seoEditor));
ok('industry SEO single source: industryContent block drops seoTitle/seoDescription inputs', !/setInd\(k,'seoTitle'/.test(seoEditor) && !/setInd\(k,'seoDescription'/.test(seoEditor));

// ---------------- §4 paid/free sample admin values stay equal to authoritative settings -------
const settingsRepo = read('repositories/settings.ts');
ok('save derives freeSampleThreshold from authoritative sample.threshold', /freeSampleThreshold: authoritativeThreshold/.test(settingsRepo));
ok('save derives paidSamplePriceEur from commerce.paidSample.priceCents', /paidSamplePriceEur: Math\.round\(priceCents \/ 100\)/.test(settingsRepo));
ok('save derives paidSampleCreditEur from commerce.paidSample.creditCents', /paidSampleCreditEur: Math\.round\(creditCents \/ 100\)/.test(settingsRepo));
const settingsEditor = read('app/admin/(shell)/ayarlar/SettingsEditor.tsx');
ok('Commercial Facts free-sample input binds to authoritative sample.threshold', /sample:\{\.\.\.v\.sample, threshold:numFrom/.test(settingsEditor));
ok('Commercial Facts paid price input binds to commerce.paidSample.priceCents', /setPaidSample\(\{priceCents:numFrom/.test(settingsEditor));

// ---------------- §5 Organization schema must NOT fall back to gmail / admin email -----------
const orgWithEmail = JSON.stringify(organizationLd({ brand: 'BUGO DUFT', email: 'kundenservice@bugoduft.de', logo: '/logo.png' }));
ok('Organization schema uses provided customer-service email', orgWithEmail.includes('kundenservice@bugoduft.de'));
ok('Organization schema NEVER contains bugoduft@gmail.com', !orgWithEmail.includes('bugoduft@gmail.com'));
const orgNoEmail = JSON.stringify(organizationLd({ brand: 'BUGO DUFT' }));
ok('Organization schema omits contactPoint when no admin email (no gmail leak)', !orgNoEmail.includes('gmail') && !/contactPoint/.test(orgNoEmail));
ok('Organization schema includes logo when provided', orgWithEmail.includes('/logo.png'));
const seoSrc = read('lib/seo.ts');
ok('lib/seo.ts no longer emits site.adminEmail in Organization schema', !/contactType:'sales'/.test(seoSrc) && !/email: site\.adminEmail/.test(seoSrc));
const homePage = read('app/[locale]/page.tsx');
ok('homepage passes service/general email to organizationLd', /organizationLd\(\{[\s\S]*settings\.contact\.service\.email/.test(homePage));

// ---------------- §6 default OG fallback chain (page -> admin default -> static) -------------
ok('product OG falls back to settings.defaultOgImage', /p\.coverImage \|\| settings\.defaultOgImage/.test(slugPage));
ok('section-index OG falls back to settings.defaultOgImage', /ov\?\.ogImage\) \|\| settings\.defaultOgImage/.test(slugPage));
ok('About/B2B OG falls back to settings.defaultOgImage', /sp\.ogImage \|\| settings\.defaultOgImage/.test(infoPage));

// ---------------- §7 homepage Scents heading admin-wired ----------------
ok('homepage consumes hc.scentsHeading override', /hc\.scentsHeading/.test(homePage));
const homeEditor = read('app/admin/(shell)/ana-sayfa/HomeEditor.tsx');
ok('HomeEditor edits scentsHeading', /scentsHeading/.test(homeEditor));
ok('HomeExtra type has scentsHeading', /scentsHeading\?:/.test(read('data/seed/home-content.ts')));

// ---------------- §8 Footer uses centralized navLabels ----------------
ok('Footer derives labels from settings.navLabels', /settings\?\.navLabels/.test(footer) && /navLabel\(/.test(footer));
ok('Footer products column uses navLabel()', /navLabel\('products'/.test(footer) && /navLabel\('scents'/.test(footer));

// ---------------- §9 role-specific contact (email + whatsapp + phone) ----------------
const homeExtras = read('components/home/HomeExtras.tsx');
ok('SupportCta takes grafik/service role contacts', /grafik\?: RoleContact/.test(homeExtras) && /service\?: RoleContact/.test(homeExtras));
ok('SupportCta renders role email + phone', /mailto:\$\{email\}/.test(homeExtras) && /tel:\$\{phone/.test(homeExtras));
ok('homepage passes per-role email/whatsapp/phone', /settings\.contact\.graphic\.email/.test(homePage) && /settings\.contact\.service\.phone/.test(homePage));

// ---------------- §10 product gallery localized ALT ----------------
const catalogDb = read('repositories/catalog.db.ts');
ok('gallery media select includes alt columns', /product_media\(role,sort_order,media\(storage_path,alt_de,alt_en,alt_fr\)\)/.test(catalogDb));
ok('readMedia returns galleryAlt', /galleryAlt: galleryRows\.map/.test(catalogDb));
const catalog = read('repositories/catalog.ts');
ok('ProductView type has galleryAlt', /galleryAlt: \(string \| null\)\[\]/.test(catalog));
const gallery = read('components/product/ProductGallery.tsx');
ok('ProductGallery accepts galleryAlt and renders active ALT', /galleryAlt\?:/.test(gallery) && /activeAlt/.test(gallery));

// ---------------- defaults sanity (authoritative values still correct) ----------------
const d = defaultSettings();
ok('default sample threshold 5000', d.sample.threshold === 5000);
ok('default paid price cents 4000', d.commerce.paidSample.priceCents === 4000);
ok('default paid credit cents 2000', d.commerce.paidSample.creditCents === 2000);

// ---------------------------------------------------------------------------------------------
// eslint-disable-next-line no-console
console.log(failures === 0 ? '\nALL WIRING TESTS PASSED' : `\n${failures} WIRING TEST(S) FAILED`);
if (failures > 0) process.exit(1);
