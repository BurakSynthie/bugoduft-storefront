'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { Locale } from '@/i18n/config';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import { ACCOUNT_COPY } from '@/lib/customer/copy';

export default function AccountShell({ locale, active, email, children }:
  { locale: Locale; active: string; email: string; children: React.ReactNode }) {
  const t = ACCOUNT_COPY[locale];
  const router = useRouter();
  async function logout() {
    const sb = createSupabaseBrowserClient();
    if (sb) await sb.auth.signOut();
    router.push(`/${locale}`); router.refresh();
  }
  const items: [string, string][] = [
    [t.account, `/${locale}/konto`],
    [t.orders, `/${locale}/konto/bestellungen`],
  ];
  return (
    <section className="section">
      <div className="container acct">
        <aside className="acct__nav">
          <div className="acct__who">{email}</div>
          <nav>
            {items.map(([label, href]) => (
              <Link key={href} href={href} aria-current={active===href ? 'page' : undefined}>{label}</Link>
            ))}
            <button type="button" className="acct__logout" onClick={logout}>{t.logout}</button>
          </nav>
        </aside>
        <div className="acct__body">{children}</div>
      </div>
    </section>
  );
}
