'use client';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import Logout from './Logout';

// Turkish admin, mobile-only chrome. Desktop keeps the existing sidebar (CSS hides
// this below the breakpoint and hides the sidebar above it). No 404s: only real
// routes are links; not-yet-built areas render as disabled "yakında" items.
type Item = { label: string; href: string };

const PRIMARY: Item[] = [
  { label: 'Panel', href: '/admin' },
  { label: 'Siparişler', href: '/admin/siparisler' },
  { label: 'Ürünler', href: '/admin/urunler' },
];

// secondary areas shown in the sheet — href present = live route, else coming later
const SECONDARY: { group: string; items: (Item | { label: string })[] }[] = [
  { group: 'Katalog', items: [
    { label: 'Ürünler', href: '/admin/urunler' },
    { label: 'Medya', href: '/admin/medya' },
    { label: 'Koleksiyonlar' }, { label: 'Kokular' },
  ] },
  { group: 'İçerik', items: [
    { label: 'Ana Sayfa' }, { label: 'Çeviriler' }, { label: 'SEO' },
    { label: 'Blog' }, { label: 'Yorumlar' },
  ] },
  { group: 'Operasyon', items: [
    { label: 'Siparişler', href: '/admin/siparisler' },
    { label: 'Teklifler' }, { label: 'Ayarlar' },
  ] },
];

const TITLES: { match: (p: string) => boolean; title: string }[] = [
  { match: p => p === '/admin', title: 'Panel' },
  { match: p => p.startsWith('/admin/siparisler'), title: 'Siparişler' },
  { match: p => p.startsWith('/admin/urunler'), title: 'Ürünler' },
  { match: p => p.startsWith('/admin/medya'), title: 'Medya' },
];

function isActive(pathname: string, href: string) {
  return href === '/admin' ? pathname === '/admin' : pathname.startsWith(href);
}

export default function AdminMobileNav({ email }: { email?: string | null }) {
  const pathname = usePathname() || '/admin';
  const [open, setOpen] = useState(false);
  const sheetRef = useRef<HTMLDivElement>(null);
  const title = TITLES.find(t => t.match(pathname))?.title ?? 'Yönetim';

  useEffect(() => { setOpen(false); }, [pathname]);
  useEffect(() => {
    if (open) document.body.classList.add('adm-lock'); else document.body.classList.remove('adm-lock');
    return () => document.body.classList.remove('adm-lock');
  }, [open]);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('keydown', onKey);
    sheetRef.current?.focus();
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  return (
    <>
      <header className="adm__mobtop">
        <span className="adm__mobbrand"><span className="logo__mark" />BUGO DUFT</span>
        <span className="adm__mobtitle">{title}</span>
      </header>

      <nav className="adm__mobbottom" aria-label="Yönetim navigasyonu">
        {PRIMARY.map(i => (
          <Link key={i.href} href={i.href} aria-current={isActive(pathname, i.href) ? 'page' : undefined}>
            <span className="adm__mobdot" aria-hidden="true" />{i.label}
          </Link>
        ))}
        <button type="button" onClick={() => setOpen(true)}>
          <span className="adm__mobdot" aria-hidden="true" />İçerik
        </button>
        <button type="button" onClick={() => setOpen(true)} aria-expanded={open}>
          <span className="adm__mobdot" aria-hidden="true" />Menü
        </button>
      </nav>

      <div className={`adm__sheet${open ? ' is-open' : ''}`} aria-hidden={!open}>
        <div className="adm__sheet-scrim" onClick={() => setOpen(false)} />
        <div className="adm__sheet-panel" role="dialog" aria-modal="true" aria-label="Menü"
          ref={sheetRef} tabIndex={-1}>
          <div className="adm__sheet-head">
            <strong>Menü</strong>
            <button className="adm__sheet-x" aria-label="Kapat" onClick={() => setOpen(false)}>×</button>
          </div>
          <div className="adm__sheet-body">
            {SECONDARY.map(sec => (
              <div key={sec.group} className="adm__sheet-group">
                <div className="adm__sheet-label">{sec.group}</div>
                {sec.items.map(it => 'href' in it ? (
                  <Link key={it.label + it.href} href={it.href}
                    aria-current={isActive(pathname, it.href) ? 'page' : undefined}
                    className="adm__sheet-link">{it.label}</Link>
                ) : (
                  <span key={it.label} className="adm__sheet-link is-soon" aria-disabled="true">
                    {it.label}<em>yakında</em>
                  </span>
                ))}
              </div>
            ))}
            <div className="adm__sheet-foot">
              {email && <div className="adm__sheet-email">{email}</div>}
              <Logout />
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
