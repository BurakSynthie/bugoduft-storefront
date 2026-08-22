// Launch admin package regression tests. PURE — never imported by production code.
// Run with:  tsx lib/settings/launch.test.ts
//
// Verifies the launch package wiring at the unit level: brand suffix normalization,
// settings merge (brand/nav/announcement/contacts/business facts/SEO/industry), per-locale
// announcement href resolution, role-specific contact separation, localized media ALT
// selection, and product option localization. Expected values are independent literals.
import { mergeSettings, defaultSettings, stripBrandSuffix, type SiteSettings } from './model';
import { optionLabel } from '../i18n/product-options';

let failures = 0;
function expect(label: string, got: unknown, want: unknown) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) failures++;
  // eslint-disable-next-line no-console
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}: got ${JSON.stringify(got)} want ${JSON.stringify(want)}`);
}

// ---------------- §I brand suffix normalization (title must carry the brand ONCE) --------------
expect('strip single legacy suffix', stripBrandSuffix('Standard Duftanhänger | BUGO DUFT', 'BUGO DUFT'), 'Standard Duftanhänger');
expect('strip doubled legacy suffix', stripBrandSuffix('Standard | BUGO DUFT | BUGO DUFT', 'BUGO DUFT'), 'Standard');
expect('strip when brand renamed (removes legacy BUGO DUFT too)', stripBrandSuffix('Produktion | BUGO DUFT', 'ACME'), 'Produktion');
expect('strip new brand suffix', stripBrandSuffix('Produktion · ACME', 'ACME'), 'Produktion');
expect('title without suffix unchanged', stripBrandSuffix('Individuelle Werbeduftanhänger', 'BUGO DUFT'), 'Individuelle Werbeduftanhänger');
expect('mid-string brand preserved (only trailing stripped)', stripBrandSuffix('BUGO DUFT Duftanhänger bedrucken', 'BUGO DUFT'), 'BUGO DUFT Duftanhänger bedrucken');
expect('empty stays empty', stripBrandSuffix('', 'BUGO DUFT'), '');

// ---------------- §B brand defaults + merge ----------------
const d = defaultSettings();
expect('default brand name', d.brandName, 'BUGO DUFT');
expect('default brand favicon null (falls back to /favicon.svg at render)', d.brand.favicon, null);
const brandMerged = mergeSettings({ brandName: 'ACME Scents', brand: { logo: 'https://x/logo.png', favicon: 'https://x/fav.png', appleTouchIcon: null } });
expect('merged brand name', brandMerged.brandName, 'ACME Scents');
expect('merged favicon', brandMerged.brand.favicon, 'https://x/fav.png');
expect('merged logo', brandMerged.brand.logo, 'https://x/logo.png');

// ---------------- §C nav labels editable, seed defaults present ----------------
expect('default nav products DE', d.navLabels.products.de, 'Duftbäume');
expect('default nav industries EN', d.navLabels.industries.en, 'For Businesses');
const navMerged = mergeSettings({ navLabels: { products: { de: 'Duftanhänger', en: '', fr: '' } } as any });
expect('merged nav overrides DE, keeps EN default', navMerged.navLabels.products.de, 'Duftanhänger');
// A blank patch value is stored as blank; the storefront render layer falls back to the
// static dictionary label when the stored value is empty (layout.tsx: nl.x[l] || dict.nav.x).
const navRender = (stored: string, dictLabel: string) => stored || dictLabel;
expect('blank nav label renders dict fallback', navRender(navMerged.navLabels.products.en, 'Air Fresheners'), 'Air Fresheners');
// A locale NOT present in the patch keeps its seed default through the merge.
const navPartial = mergeSettings({ navLabels: { scents: { de: 'Aromen' } } as any });
expect('merged nav keeps EN default when key absent from patch', navPartial.navLabels.scents.en, 'Scents');

// ---------------- §D per-locale announcement href resolution ----------------
// Simulate the layout's resolution: hrefL10n[locale] || legacy href.
const annSettings: SiteSettings = mergeSettings({
  announcement: { enabled: true, configured: true, text: { de:'x', en:'x', fr:'x' } as any,
    linkLabel: { de:'L', en:'L', fr:'L' } as any, href: '/de/produkte',
    hrefL10n: { de: '/de/produkte', en: '/en/products', fr: '/fr/produits' } as any },
});
const resolveHref = (l: 'de'|'en'|'fr') => annSettings.announcement.hrefL10n[l] || annSettings.announcement.href;
expect('DE announcement href', resolveHref('de'), '/de/produkte');
expect('EN announcement href (NOT the DE url)', resolveHref('en'), '/en/products');
expect('FR announcement href (NOT the DE url)', resolveHref('fr'), '/fr/produits');
// missing locale href falls back to legacy single href, never a different locale's URL.
const annPartial = mergeSettings({ announcement: { enabled:true, configured:true, href:'/de/fallback',
  hrefL10n: { de:'/de/a', en:'', fr:'' } as any } as any });
const resolvePartial = (l: 'de'|'en'|'fr') => annPartial.announcement.hrefL10n[l] || annPartial.announcement.href;
expect('EN missing href falls back to legacy (not DE locale url)', resolvePartial('en'), '/de/fallback');

// ---------------- §E role-specific contacts (grafik vs kundenservice separate) ----------------
expect('default graphic whatsapp', d.contact.graphic.whatsapp, '+90 507 296 61 75');
expect('default service whatsapp', d.contact.service.whatsapp, '+90 531 723 48 01');
expect('graphic and service whatsapp are DISTINCT', d.contact.graphic.whatsapp !== d.contact.service.whatsapp, true);
expect('default graphic email', d.contact.graphic.email, 'grafik@bugoduft.de');
expect('default service email', d.contact.service.email, 'kundenservice@bugoduft.de');
const cMerged = mergeSettings({ contact: { graphic: { whatsapp: '+49 111' } } as any });
expect('merged graphic whatsapp override', cMerged.contact.graphic.whatsapp, '+49 111');
expect('merged service whatsapp keeps default (independent)', cMerged.contact.service.whatsapp, '+90 531 723 48 01');

// ---------------- §F business facts defaults reflect the accepted business rules ----------------
expect('MOQ default', d.businessFacts.minOrderQty, 1000);
expect('qty step default', d.businessFacts.qtyStep, 1000);
expect('production days', [d.businessFacts.productionMinDays, d.businessFacts.productionMaxDays], [10, 12]);
expect('delivery days', [d.businessFacts.deliveryMinDays, d.businessFacts.deliveryMaxDays], [15, 17]);
expect('free sample threshold 5000', d.businessFacts.freeSampleThreshold, 5000);
expect('paid sample price 40', d.businessFacts.paidSamplePriceEur, 40);
expect('paid sample credit 20', d.businessFacts.paidSampleCreditEur, 20);
expect('delivery region EN is Europe-wide (not worldwide)', d.businessFacts.deliveryRegion.en, 'Europe-wide');

// ---------------- §H per-page SEO overrides merge, seed-empty fallback ----------------
expect('default home page seo title empty (falls back to seed)', d.seo.pages.home.title.de, '');
const seoMerged = mergeSettings({ seo: { pages: { production: { title: { de: 'Produktion in Deutschland', en:'', fr:'' } } } } as any });
expect('merged production seo title DE', seoMerged.seo.pages.production.title.de, 'Produktion in Deutschland');
expect('unspecified page still present after merge', typeof seoMerged.seo.pages.about.description.de, 'string');

// ---------------- §K industry content merge ----------------
const indMerged = mergeSettings({ industryContent: { autohaus: { h1: { de:'Autohaus DE', en:'', fr:'' } } } as any });
expect('merged autohaus h1 DE', indMerged.industryContent.autohaus.h1.de, 'Autohaus DE');
expect('werkstatt still present', typeof indMerged.industryContent.werkstatt.body.de, 'string');

// ---------------- §J localized media ALT selection (mirrors catalog.db coverAltFor) ----------------
function coverAltFor(cover: { alt_de?: string|null; alt_en?: string|null; alt_fr?: string|null } | null, locale: 'de'|'en'|'fr'): string | null {
  if (!cover) return null;
  const alt = locale === 'de' ? cover.alt_de : locale === 'en' ? cover.alt_en : cover.alt_fr;
  return (alt && String(alt).trim()) ? String(alt) : null;
}
const cover = { alt_de: 'Duftanhänger mit Logo', alt_en: 'Air freshener with logo', alt_fr: 'Désodorisant avec logo' };
expect('cover ALT DE', coverAltFor(cover, 'de'), 'Duftanhänger mit Logo');
expect('cover ALT EN', coverAltFor(cover, 'en'), 'Air freshener with logo');
expect('cover ALT FR', coverAltFor(cover, 'fr'), 'Désodorisant avec logo');
expect('cover ALT null when missing', coverAltFor({ alt_de: '', alt_en: null }, 'de'), null);
expect('cover ALT null when no cover', coverAltFor(null, 'de'), null);

// ---------------- §L product option localization (no German label on EN/FR) ----------------
expect('option intense DE', optionLabel('intense_fragrance', 'Intensivduft', 'de'), 'Intensivduft');
expect('option intense EN (not German)', optionLabel('intense_fragrance', 'Intensivduft', 'en'), 'Intensive fragrance');
expect('option intense FR (not German)', optionLabel('intense_fragrance', 'Intensivduft', 'fr'), 'Parfum intense');
expect('unknown option key falls back to stored labelDe', optionLabel('custom_key', 'Sonderoption', 'en'), 'Sonderoption');

// ---------------- non-regression: accepted commerce rules unchanged in defaults ----------------
expect('paid sample cents 4000 (€40)', d.commerce.paidSample.priceCents, 4000);
expect('paid sample credit cents 2000 (€20)', d.commerce.paidSample.creditCents, 2000);
expect('free sample set threshold 5000 unchanged', d.sample.threshold, 5000);

// ---------------------------------------------------------------------------------------------
// eslint-disable-next-line no-console
console.log(failures === 0 ? '\nALL LAUNCH TESTS PASSED' : `\n${failures} LAUNCH TEST(S) FAILED`);
if (failures > 0) process.exit(1);
