import Link from 'next/link';
import type { Locale } from '@/i18n/config';
import type { Dict } from '@/i18n';
import type { SiteSettings } from '@/lib/settings/model';
import { Container } from '@/components/ui';
import { sectionPath } from '@/lib/routing';
import CookieSettingsButton from '@/components/layout/CookieSettingsButton';

export default function Footer({ locale, dict, settings }: { locale: Locale; dict: Dict; settings?: SiteSettings }) {
  const f = dict.footer;
  const c = settings?.contact;
  // §B single brand source for footer logo + copyright (falls back to the shipped default).
  const brand = settings?.brandName || 'BUGO DUFT';
  // Completion pass §11: footer business copy is admin-editable (Ayarlar -> Footer,
  // repositories/settings.ts single source of truth) with the existing static i18n
  // strings kept only as the seed-fallback for never-configured state. Legal/technical
  // route labels/links (f.legal, f.company, f.service columns) stay static — those are
  // fixed navigation, not business copy, and are explicitly out of scope here.
  const fc = settings?.footer;
  // §8 Footer uses the SAME centralized, admin-editable navigation labels as the desktop
  // header and mobile drawer (settings.navLabels), falling back to the static dictionary when
  // a label is empty or settings are unavailable. Routes remain fixed in code.
  const nl = settings?.navLabels;
  const navLabel = (k: 'products'|'scents'|'industries'|'sample'|'production'|'faq', fallback: string) =>
    (nl?.[k]?.[locale] || fallback);
  const brandCopy = fc?.brandCopy?.[locale] || (dict.common.minOrder + '.');
  const minOrderCopy = fc?.minOrderCopy?.[locale] || '';
  const bottomStatement = settings?.originClaim?.[locale] || fc?.bottomStatement?.[locale] || '';
  const social: [string, string][] = [];
  if (c?.email) social.push(['E-Mail', `mailto:${c.email}`]);
  if (c?.whatsapp) social.push(['WhatsApp', `https://wa.me/${c.whatsapp.replace(/\D/g,'')}`]);
  if (c?.instagram) social.push(['Instagram', c.instagram]);
  if (c?.facebook) social.push(['Facebook', c.facebook]);
  if (c?.linkedin) social.push(['LinkedIn', c.linkedin]);
  const col = (title: string, links: [string, string][]) => (
    <div>
      <h4>{title}</h4>
      <ul>{links.map(([label, href]) => <li key={label}><Link href={href}>{label}</Link></li>)}</ul>
    </div>
  );
  return (
    <footer className="footer">
      <Container>
        <div className="footer__cols">
          <div>
            <Link className="logo" href={`/${locale}`} style={{ color:'#fff' }}>
              {settings?.brand.logo
                ? <img className="logo__img logo__img--footer" src={settings.brand.logo} alt={brand} />
                : <><span className="logo__mark" />{brand}</>}
            </Link>
            <p style={{ color:'#8B93A2', marginTop:'var(--s-4)', maxWidth:'32ch', fontSize:'.9rem' }}>{brandCopy}</p>
            {minOrderCopy && <p style={{ color:'#8B93A2', marginTop:'var(--s-2)', maxWidth:'32ch', fontSize:'.85rem' }}>{minOrderCopy}</p>}
          </div>
          {col(f.products, [
            [navLabel('products', dict.nav.products), sectionPath('products', locale)],
            [navLabel('scents', dict.nav.scents), sectionPath('scents', locale)],
            [navLabel('industries', dict.nav.industries), sectionPath('industries', locale)],
            [navLabel('sample', locale==='de'?'Duftmuster':locale==='en'?'Fragrance Sample':'Échantillons'), sectionPath('sample', locale)],
            [navLabel('production', dict.nav.production), `/${locale}#produktion`],
          ])}
          {col(f.service, [
            [dict.nav.contact, `/${locale}#kontakt`],
            [navLabel('faq', dict.nav.faq), `/${locale}#faq`],
            [f.shipping, `/${locale}/info/versand`],
            [f.orderStatus, `/${locale}/konto/bestellungen`],
          ])}
          {col(f.company, [
            [f.about, `/${locale}/info/about`],
            [f.b2b, `/${locale}/info/b2b`],
            [f.large, `/${locale}#angebot`],
          ])}
          <div>
            <h4>{f.legal}</h4>
            <ul>
              <li><Link href={`/${locale}/info/impressum`}>{f.imprint}</Link></li>
              <li><Link href={`/${locale}/info/datenschutz`}>{f.privacy}</Link></li>
              <li><Link href={`/${locale}/info/agb`}>{f.terms}</Link></li>
              <li><Link href={`/${locale}/info/widerruf`}>{f.withdrawal}</Link></li>
              <li><CookieSettingsButton label={f.cookies} /></li>
            </ul>
          </div>
          {social.length > 0 && col(dict.nav.contact, social.map(([l, h]) => [l, h] as [string, string]))}
        </div>
        <div className="footer__bottom">
          <span>© {new Date().getFullYear()} {brand}. {f.rights}</span>
          <span>{bottomStatement}</span>
        </div>
      </Container>
    </footer>
  );
}
