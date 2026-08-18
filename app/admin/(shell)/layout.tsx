import type { ReactNode } from 'react';
import Link from 'next/link';
import { requireAdmin } from '@/lib/supabase/admin-auth';
import Logout from './Logout';
import AdminMobileNav from './AdminMobileNav';


import { ADMIN_NAV as nav } from '@/lib/admin/nav';
export const dynamic = 'force-dynamic';   // admin auth must run per-request, never statically cached

export default async function AdminShellLayout({ children }: { children: ReactNode }) {
  const admin = await requireAdmin();                 // redirects to /admin/giris if not an admin
  return (
    <div className="adm">
      <AdminMobileNav email={admin?.email} />
      <aside className="adm__side">
        <div className="adm__brand"><span className="logo__mark" />BUGO DUFT</div>
        <nav className="adm__nav">
          {nav.map(({ group, items }) => (
            <div key={group}>
              <div className="adm__navlabel">{group}</div>
              {items.map(({ label, href }) => <Link key={href} href={href}>{label}</Link>)}
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
