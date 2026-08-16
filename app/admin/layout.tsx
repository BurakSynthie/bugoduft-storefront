import type { ReactNode } from 'react';
import Link from 'next/link';
import { getAdminUser } from '@/lib/supabase/admin-auth';
import Logout from './Logout';
import '../globals.css';
import './admin.css';
// Admin panel is Turkish-only and lives outside the localized storefront tree.
export const metadata = { title: 'BUGO DUFT · Yönetim', robots: { index:false, follow:false } };

const nav = [
  ['Genel', [['Panel','/admin']]],
  ['Katalog', [['Ürünler','/admin/urunler'],['Koleksiyonlar','/admin/koleksiyonlar'],['Kokular','/admin/kokular']]],
  ['İçerik', [['Ana sayfa','/admin/ana-sayfa'],['Çeviriler','/admin/ceviriler'],['SEO','/admin/seo']]],
  ['Operasyon', [['Siparişler','/admin/siparisler'],['Teklifler','/admin/teklifler'],['Ayarlar','/admin/ayarlar']]],
] as const;

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const admin = await getAdminUser();
  return (
    <html lang="tr">
      <body>
        <div className="adm">
          <aside className="adm__side">
            <div className="adm__brand"><span className="logo__mark" />BUGO DUFT</div>
            <nav className="adm__nav">
              {nav.map(([label, items]) => (
                <div key={label}>
                  <div className="adm__navlabel">{label}</div>
                  {items.map(([t, href]) => <Link key={href} href={href}>{t}</Link>)}
                </div>
              ))}
            </nav>
            {admin && <div style={{marginTop:'var(--s-6)',borderTop:'1px solid #23262E',paddingTop:'var(--s-4)'}}>
              <div style={{fontSize:'.72rem',color:'#69707E',marginBottom:'.25rem'}}>{admin.email}</div>
              <Logout />
            </div>}
          </aside>
          <main className="adm__main">{children}</main>
        </div>
      </body>
    </html>
  );
}
