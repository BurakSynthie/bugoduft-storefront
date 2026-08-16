import type { ReactNode } from 'react';
import Link from 'next/link';
import { requireAdmin } from '@/lib/supabase/admin-auth';
import Logout from './Logout';
import AdminMobileNav from './AdminMobileNav';

const nav = [
  ['Genel', [['Panel','/admin']]],
  ['Katalog', [['Ürünler','/admin/urunler'],['Medya','/admin/medya'],['Koleksiyonlar','/admin/koleksiyonlar'],['Kokular','/admin/kokular']]],
  ['İçerik', [['Ana sayfa','/admin/ana-sayfa'],['Çeviriler','/admin/ceviriler'],['SEO','/admin/seo']]],
  ['Operasyon', [['Siparişler','/admin/siparisler'],['Teklifler','/admin/teklifler'],['Ayarlar','/admin/ayarlar']]],
] as const;

export default async function AdminShellLayout({ children }: { children: ReactNode }) {
  const admin = await requireAdmin();                 // redirects to /admin/giris if not an admin
  return (
    <div className="adm">
      <AdminMobileNav email={admin?.email} />
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
  );
}
