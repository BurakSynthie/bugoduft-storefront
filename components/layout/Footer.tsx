import Link from 'next/link';
import type { Locale } from '@/i18n/config';
import type { Dict } from '@/i18n';
import type { SiteSettings } from '@/lib/settings/model';
import { Container } from '@/components/ui';
import { sectionPath } from '@/lib/routing';

export default function Footer({ locale, dict, settings }: { locale: Locale; dict: Dict; settings?: SiteSettings }) {
  const f = dict.footer;
  const c = settings?.contact;
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
            <Link className="logo" href={`/${locale}`} style={{ color:'#fff' }}><span className="logo__mark" />BUGO&nbsp;DUFT</Link>
            <p style={{ color:'#8B93A2', marginTop:'var(--s-4)', maxWidth:'32ch', fontSize:'.9rem' }}>{dict.common.minOrder}.</p>
          </div>
          {col(f.products, [
            [dict.nav.products, sectionPath('products', locale)],
            [dict.nav.scents, sectionPath('scents', locale)],
            [dict.nav.industries, sectionPath('industries', locale)],
            [dict.nav.production, `/${locale}#produktion`],
          ])}
          {col(f.service, [
            [dict.nav.contact, `/${locale}#kontakt`],
            [dict.nav.faq, `/${locale}#faq`],
            [f.shipping, `/${locale}#versand`],
            [f.orderStatus, `/${locale}#status`],
          ])}
          {col(f.company, [
            [f.about, `/${locale}#about`],
            [f.b2b, `/${locale}#b2b`],
            [f.large, `/${locale}#angebot`],
          ])}
          {col(f.legal, [
            [f.imprint, `/${locale}#impressum`],
            [f.privacy, `/${locale}#datenschutz`],
            [f.terms, `/${locale}#agb`],
            [f.withdrawal, `/${locale}#widerruf`],
            [f.cookies, `/${locale}#cookies`],
          ])}
          {social.length > 0 && col(dict.nav.contact, social.map(([l, h]) => [l, h] as [string, string]))}
        </div>
        <div className="footer__bottom">
          <span>© {new Date().getFullYear()} BUGO DUFT. {f.rights}</span>
          <span>Made for your brand · Germany</span>
        </div>
      </Container>
    </footer>
  );
}
