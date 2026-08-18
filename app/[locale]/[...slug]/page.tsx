import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import ProductGallery from '@/components/product/ProductGallery';
import { locales, isLocale, type Locale } from '@/i18n/config';
import { getDict } from '@/i18n';
import { seg, matchSection, sectionPath, itemPath, configuratorPath, type Section } from '@/lib/routing';
import {
  listProducts, getProductBySlug, listCollections, listScents, scentCategories,
  listIndustries, getIndustryBySlug,
  productAlternates, industryAlternates, sectionAlternates,
} from '@/repositories/catalog';
import { buildMetadata, breadcrumbLd, productLd } from '@/lib/seo';
import { abs } from '@/config/site';
import { formatMoney } from '@/lib/money';
import { Container, SectionHeader, Button, Price, Badge } from '@/components/ui';
import { IconArrow, IconCheck } from '@/components/ui/icons';
import JsonLd from '@/seo/JsonLd';
import Configurator from '@/components/configurator/Configurator';
import SamplePage from '@/components/storefront/SamplePage';
import { PrintFileCheckSection } from '@/components/storefront/PrintFileCheckCta';
import { getSettings } from '@/repositories/settings';
import { getProductBySlug as getProductBySlugRead, getProducts as getProductsRead, getCollections as getCollectionsRead, getScents as getScentsRead, getProductAlternates } from '@/repositories/catalog.read';

const DETAILS: Record<string,string> = { de:'Details ansehen', en:'View details', fr:'Voir les détails' };
type Params = { locale: string; slug: string[] };

// -------- resolve a path into a typed route --------
type Resolved =
  | { kind:'section-index'; section: Section }
  | { kind:'product'; slug: string }
  | { kind:'industry'; slug: string }
  | null;

function resolve(locale: Locale, slug: string[]): Resolved {
  if (slug.length < 1 || slug.length > 2) return null;
  const section = matchSection(locale, slug[0]);
  if (!section) return null;
  if (slug.length === 1) return { kind:'section-index', section };
  if (section === 'products') return { kind:'product', slug: slug[1] };
  if (section === 'industries') return { kind:'industry', slug: slug[1] };
  return null; // scents have no detail pages in this phase
}

export function generateStaticParams() {
  const out: Params[] = [];
  for (const locale of locales) {
    for (const s of ['products','scents','industries','configurator','sample'] as Section[]) out.push({ locale, slug:[seg[s][locale]] });
    for (const p of listProducts(locale)) out.push({ locale, slug:[seg.products[locale], p.slug] });
    for (const i of listIndustries(locale)) out.push({ locale, slug:[seg.industries[locale], i.slug] });
  }
  return out;
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  if (!isLocale(params.locale)) return {};
  const locale = params.locale as Locale;
  const r = resolve(locale, params.slug);
  if (!r) return {};
  if (r.kind === 'product') {
    const p = await getProductBySlugRead(locale, r.slug); if (!p) return {};
    const alternates = await getProductAlternates(p.groupId);
    return buildMetadata({ locale, path: itemPath('products', locale, p.slug),
      title: p.seo.title, description: p.seo.description, alternates, ogType:'article',
      ogImage: p.coverImage ?? undefined });
  }
  if (r.kind === 'industry') {
    const i = getIndustryBySlug(locale, r.slug); if (!i) return {};
    return buildMetadata({ locale, path: itemPath('industries', locale, i.slug),
      title: i.seo.title, description: i.seo.description, alternates: industryAlternates(i.groupId) });
  }
  if (r.kind === 'section-index' && r.section === 'configurator') {
    return { title: 'Konfigurator | BUGO DUFT', robots: { index:false, follow:true } };
  }
  if (r.kind === 'section-index' && r.section === 'sample') {
    const title = locale==='de' ? 'Duftmuster-Set — 40 Düfte | BUGO DUFT'
      : locale==='en' ? 'Fragrance Sample Set — 40 Scents | BUGO DUFT'
      : 'Coffret d’échantillons — 40 Parfums | BUGO DUFT';
    const price = formatMoney((await getSettings()).commerce.paidSample.priceCents, 'EUR', locale);
    return buildMetadata({ locale, path: sectionPath('sample', locale), title,
      description: locale==='de' ? `Testen Sie alle 40 BUGO-Düfte für einmalig ${price}.`
        : locale==='en' ? `Try all 40 BUGO fragrances for a one-time ${price}.`
        : `Testez les 40 parfums BUGO pour ${price} une seule fois.`,
      alternates: sectionAlternates('sample') });
  }
  // section index
  const dict = getDict(locale);
  const titles: Record<Section, string> = {
  products: dict.nav.products,
  scents: dict.nav.scents,
  industries: dict.nav.industries,
  configurator: "Konfigurator",
  sample: locale==='de' ? 'Duftmuster' : locale==='en' ? 'Fragrance Sample' : 'Échantillons'
};
  return buildMetadata({ locale, path: sectionPath(r.section, locale),
    title: `${titles[r.section]} | BUGO DUFT`,
    description: dict.common.minOrder + '.', alternates: sectionAlternates(r.section) });
}

// -------- page --------
export default async function CatchAll({ params, searchParams }: { params: Params; searchParams?: { k?: string } }) {
  if (!isLocale(params.locale)) notFound();
  const locale = params.locale as Locale;
  const dict = getDict(locale);
  const r = resolve(locale, params.slug);
  if (!r) notFound();

  const crumbHome = { name:'Home', url: abs(`/${locale}`) };

  if (r.kind === 'section-index' && r.section === 'configurator') {
    // §P0: build the live configurator catalog from the DB-first read layer (admin edits,
    // DB tiers & product_scents) — NOT the seed aliases — so the configured/displayed values
    // match what the server validates and Shopify charges. Collections with no active DB
    // product are skipped rather than crashing.
    const products = await getProductsRead(locale);
    const cols = await getCollectionsRead(locale);
    type ConfCol = { collectionCode:string; collectionName:string; productId:string;
      basePriceCents:number; scentCodes:string[]; tiers:{minQty:number; ratePer1000Cents:number}[] };
    const collections: ConfCol[] = cols.flatMap(c => {
      const p = products.find(pp => pp.collectionCode === c.code);
      if (!p) return [];
      return [{ collectionCode:c.code, collectionName:c.name, productId:p.id,
        basePriceCents:p.basePriceCents, scentCodes:p.scentCodes,
        tiers:(p.tiers||[]).map(tt=>({minQty:tt.minQty, ratePer1000Cents:tt.unitPriceCents})) }];
    });
    const settings = await getSettings();
    const sset = settings.sample;
    const scents = await getScentsRead(locale);
    const intense = products[0]?.options.find(o => o.key === 'intense_fragrance');
    const k = searchParams?.k && collections.find(c => c.collectionCode === searchParams.k) ? searchParams.k : undefined;
    return <Configurator locale={locale} collections={collections} scents={scents}
      intenseCents={intense ? intense.priceDeltaCents : 3000} initialCollection={k}
      sampleThreshold={sset.enabled ? sset.threshold : 0} sampleValueEur={sset.valueEur}
      contactEmail={settings.contact.email || null} contactWhatsapp={settings.contact.whatsapp || null} />;
  }

  if (r.kind === 'section-index' && r.section === 'sample') {
    const settings = await getSettings();
    const ps = settings.commerce.paidSample;
    if (!ps.enabled) notFound();   // §P1: admin can disable the paid Duftmuster-Set entirely
    return <SamplePage locale={locale} priceCents={ps.priceCents} creditCents={ps.creditCents}
      contactEmail={settings.contact.email || null} contactWhatsapp={settings.contact.whatsapp || null} />;
  }

  if (r.kind === 'product') {
    const p = await getProductBySlugRead(locale, r!.slug); if (!p) notFound();
    const scents = (await getScentsRead(locale)).filter(s => p.scentCodes.includes(s.code));
    const crumbs = [ crumbHome,
      { name: dict.nav.products, url: abs(sectionPath('products', locale)) },
      { name: p.name, url: abs(itemPath('products', locale, p.slug)) } ];
    return (
      <>
        <JsonLd data={[
          breadcrumbLd(crumbs),
          productLd({ name:p.name, description:p.seo.description, url:abs(itemPath('products',locale,p.slug)),
            priceFromCents:p.priceFromCents, currency:p.currency }),
        ]} />
        <section className="section">
          <Container>
            <nav aria-label="Breadcrumb" style={{ fontSize:'.85rem', color:'var(--fg-muted)', marginBottom:'var(--s-5)' }}>
              <Link href={`/${locale}`}>Home</Link> / <Link href={sectionPath('products', locale)}>{dict.nav.products}</Link> / <span>{p.name}</span>
            </nav>
            <div className="hero__grid">
              <div>
                <span className="eyebrow">{p.collectionCode}</span>
                {p.badge && <Badge accent>{p.badge}</Badge>}
                {p.promoActive && p.promoBadge && <Badge accent>{p.promoBadge}</Badge>}
                <h1 style={{ fontSize:'var(--t-h2)', marginTop:'var(--s-3)' }}>{p.h1}</h1>
                <p className="lede">{p.shortDesc || p.longDesc}</p>
                <div style={{ margin:'var(--s-6) 0', display:'flex', alignItems:'baseline', gap:'var(--s-3)', flexWrap:'wrap' }}>
                  <Price cents={p.priceFromCents} currency={p.currency} locale={locale} from={dict.common.from} />
                  {p.promoActive && p.compareAtCents && <span className="price-compare">{formatMoney(p.compareAtCents, p.currency, locale)}</span>}
                  <span className="muted" style={{ fontSize:'.85rem' }}>{p.moqText || `${dict.common.perOrder} · ${dict.common.minOrder}`}</span>
                </div>
                {/* Volume tiers (server-authoritative pricing surfaced honestly) */}
                <div className="card" style={{ padding:'var(--s-5)', marginBottom:'var(--s-5)' }}>
                  <strong style={{ fontSize:'.9rem' }}>{locale==='de'?'Staffelpreise':locale==='en'?'Volume pricing':'Tarifs dégressifs'}</strong>
                  <div style={{ marginTop:'var(--s-3)', display:'grid', gap:'.4rem' }}>
                    {p.tiers.map(t => (
                      <div key={t.minQty} style={{ display:'flex', justifyContent:'space-between', fontSize:'.92rem' }}>
                        <span className="muted">{locale==='de'?'ab':locale==='en'?'from':'dès'} {new Intl.NumberFormat(locale==='de'?'de-DE':locale==='en'?'en-IE':'fr-FR').format(t.minQty)} {locale==='fr'?'pièces':'Stück'}</span>
                        <span className="price">{formatMoney(t.unitPriceCents, p.currency, locale)}</span>
                      </div>
                    ))}
                  </div>
                </div>
                <div style={{ display:'flex', gap:'var(--s-3)', flexWrap:'wrap' }}>
                  <Button href={configuratorPath(locale, p.collectionCode)} variant="primary" size="lg">{dict.cta.configure.toUpperCase()}</Button>
                  <Button href={`/${locale}#angebot`} variant="ghost" size="lg">{dict.cta.quote}</Button>
                </div>
                <ul style={{ listStyle:'none', padding:0, marginTop:'var(--s-6)', display:'grid', gap:'.5rem' }}>
                  {p.options.map(o => (
                    <li key={o.key} style={{ display:'flex', gap:'.5rem', alignItems:'center', color:'var(--fg-muted)', fontSize:'.92rem' }}>
                      <IconCheck size={16} /> {o.labelDe}
                      {o.priceDeltaCents>0 && <Badge>+{formatMoney(o.priceDeltaCents, p.currency, locale)}</Badge>}
                    </li>
                  ))}
                </ul>
              </div>
              {/* sticky product visual (~45% col): interactive gallery — thumbs switch main */}
              <div style={{ position:'sticky', top:'88px', alignSelf:'start' }}>
                <ProductGallery cover={p.coverImage ?? null} coverAlt={p.coverAlt ?? null}
                  gallery={p.gallery} collectionCode={p.collectionCode} name={p.name} />
                <div className="chips" style={{ marginTop:'var(--s-4)' }}>
                  {scents.slice(0,6).map(s => <span key={s.code} className="chip" aria-pressed={false}>{s.name}</span>)}
                </div>
              </div>
            </div>
            {(
              <div className="pdp__info">
                {p.features.length>0 && (
                  <div className="pdp__block">
                    <h2>{locale==='de'?'Highlights':locale==='en'?'Highlights':'Points forts'}</h2>
                    <ul className="pdp__features">
                      {p.features.map((f,i)=>(<li key={i}><IconCheck size={16} /> {f}</li>))}
                    </ul>
                  </div>
                )}
                {p.useCase && (
                  <div className="pdp__block">
                    <h2>{locale==='de'?'Ideal für':locale==='en'?'Ideal for':'Idéal pour'}</h2>
                    <p className="muted">{p.useCase}</p>
                  </div>
                )}
                {(p.longDesc && p.longDesc!==p.shortDesc) && (
                  <div className="pdp__block">
                    <h2>{locale==='de'?'Details':locale==='en'?'Details':'Détails'}</h2>
                    <p className="muted">{p.longDesc}</p>
                  </div>
                )}
                {p.productionInfo && (
                  <div className="pdp__block">
                    <h2>{locale==='de'?'Produktion':locale==='en'?'Production':'Production'}</h2>
                    <p className="muted">{p.productionInfo}</p>
                  </div>
                )}
                {p.deliveryInfo && (
                  <div className="pdp__block">
                    <h2>{locale==='de'?'Lieferung':locale==='en'?'Delivery':'Livraison'}</h2>
                    <p className="muted">{p.deliveryInfo}</p>
                  </div>
                )}
                <div className="pdp__block">
                  <h2>{locale==='de'?'Im Preis enthalten':locale==='en'?'Included in the price':'Inclus dans le prix'}</h2>
                  <ul className="pdp__features">
                    {(locale==='de'
                      ? ['Individuelle Gestaltung','Vorder- & Rückseite','Korrekturen','Druckdatenprüfung','Persönliche Abstimmung','Freigabe vor Produktion']
                      : locale==='en'
                      ? ['Custom design','Front & back','Revisions','Print-file check','Personal coordination','Approval before production']
                      : ['Design personnalisé','Recto & verso','Corrections','Vérification des fichiers','Coordination personnelle','Validation avant production']
                    ).map((f,i)=>(<li key={i}><IconCheck size={16} /> {f}</li>))}
                  </ul>
                </div>
              </div>
            )}
          </Container>
        </section>
      </>
    );
  }

  if (r.kind === 'industry') {
    const i = getIndustryBySlug(locale, r!.slug); if (!i) notFound();
    const crumbs = [ crumbHome, { name: dict.nav.industries, url: abs(sectionPath('industries', locale)) },
      { name: i.name, url: abs(itemPath('industries', locale, i.slug)) } ];
    return (
      <>
        <JsonLd data={breadcrumbLd(crumbs)} />
        <section className="section">
          <Container><div style={{ maxWidth: 760 }}>
            <span className="eyebrow">{dict.nav.industries}</span>
            <h1 style={{ fontSize:'var(--t-h2)', marginTop:'var(--s-3)' }}>{i.headline}</h1>
            <p className="lede">{i.body}</p>
            <div style={{ marginTop:'var(--s-6)' }}>
              <Button href={`/${locale}#angebot`} variant="primary" size="lg">{dict.cta.quote}</Button>
            </div>
          </div></Container>
        </section>
      </>
    );
  }

  // ---- section index ----
  if (r.section === 'products') {
    const products = await getProductsRead(locale);
    const cols = await getCollectionsRead(locale);
    const settings = await getSettings();
    return (
      <>
      <section className="section">
        <Container>
          <SectionHeader eyebrow={dict.nav.products} title={dict.cta.all}
            lede={dict.common.minOrder + '.'} />
          <div className="grid grid-4">
            {cols.map(c => {
              const p = products.find(pp => pp.collectionCode === c.code);
              return (
                <article key={c.code} className={`card ccard${p ? ' ccard--click' : ''}`}>
                  <div className="ccard__media" data-c={c.code}>
                    {c.coverImage && <img src={c.coverImage} alt={c.name} className="ccard__cover" loading="lazy" />}
                  </div>
                  <div className="ccard__body">
                    <div className="ccard__row"><h3>{c.name}</h3>{c.code==='VIP' && <Badge accent>Top</Badge>}</div>
                    <p className="muted" style={{ margin:'.4rem 0 var(--s-4)', fontSize:'.9rem' }}>{c.description}</p>
                    <div className="ccard__row">
                      {c.priceFromCents!=null &&
                        <span style={{ display:'inline-flex', alignItems:'baseline', gap:'.4rem', flexWrap:'wrap' }}>
                          <Price cents={c.priceFromCents} currency="EUR" locale={locale} from={dict.common.from} label={dict.common.perOrder} />
                          {c.promoActive && c.compareAtCents && <span className="price-compare">{new Intl.NumberFormat(locale==='de'?'de-DE':locale==='en'?'en-IE':'fr-FR',{style:'currency',currency:'EUR'}).format(c.compareAtCents/100)}</span>}
                        </span>}
                      {p && <Link href={itemPath('products', locale, p.slug)} className="ccard__details ccard__stretch">{DETAILS[locale]} <IconArrow size={15} /></Link>}
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        </Container>
      </section>
      <PrintFileCheckSection locale={locale} contactEmail={settings.contact.email || null} contactWhatsapp={settings.contact.whatsapp || null} />
      </>
    );
  }
  if (r.section === 'scents') {
    const scents = await getScentsRead(locale);
    const catLabel = (c:string) => ({de:{frisch:'Frisch',fruchtig:'Fruchtig',suess:'Süß',elegant:'Elegant',intensiv:'Intensiv'},
      en:{frisch:'Fresh',fruchtig:'Fruity',suess:'Sweet',elegant:'Elegant',intensiv:'Intense'},
      fr:{frisch:'Frais',fruchtig:'Fruité',suess:'Sucré',elegant:'Élégant',intensiv:'Intense'}} as any)[locale][c];
    return (
      <section className="section">
        <Container>
          <SectionHeader eyebrow={dict.nav.scents} title={dict.nav.scents} />
          {scentCategories.map(cat => {
            const group = scents.filter(s => s.category === cat);
            if (!group.length) return null;
            return (
              <div key={cat} style={{ marginBottom:'var(--s-8)' }}>
                <h3 style={{ fontSize:'1.1rem', marginBottom:'var(--s-4)' }}>{catLabel(cat)}</h3>
                <div className="scentgrid">
                  {group.map(s => <div className="scent" key={s.code}><b>{s.name}</b><small>{s.description}</small></div>)}
                </div>
              </div>
            );
          })}
        </Container>
      </section>
    );
  }
  // industries index
  const items = listIndustries(locale);
  return (
    <section className="section">
      <Container>
        <SectionHeader eyebrow={dict.nav.industries} title={dict.nav.industries} />
        <div className="grid grid-2">
          {items.map(i => (
            <Link key={i.slug} href={itemPath('industries', locale, i.slug)} className="card" style={{ padding:'var(--s-6)' }}>
              <h3 style={{ fontSize:'1.15rem' }}>{i.headline}</h3>
              <p className="muted" style={{ marginTop:'.5rem' }}>{i.body}</p>
            </Link>
          ))}
        </div>
      </Container>
    </section>
  );
}
