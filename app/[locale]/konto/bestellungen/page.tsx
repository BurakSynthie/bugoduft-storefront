import { redirect, notFound } from 'next/navigation';
import Link from 'next/link';
import { isLocale, type Locale } from '@/i18n/config';
import { getCustomerUser, ensureCustomerRow, getCustomerOrders } from '@/lib/customer/session';
import { ACCOUNT_COPY, CUSTOMER_STATUS } from '@/lib/customer/copy';
import AccountShell from '@/components/account/AccountShell';
export const dynamic = 'force-dynamic';
const money = (c:number,cur:string,l:Locale)=> new Intl.NumberFormat(l==='de'?'de-DE':l==='en'?'en-IE':'fr-FR',{style:'currency',currency:cur||'EUR'}).format(c/100);

export default async function Orders({ params }: { params:{ locale:string } }) {
  if (!isLocale(params.locale)) notFound();
  const locale = params.locale as Locale;
  const user = await getCustomerUser();
  if (!user) redirect(`/${locale}/konto/anmelden`);
  await ensureCustomerRow(user);
  const t = ACCOUNT_COPY[locale];
  const orders = await getCustomerOrders();
  return (
    <AccountShell locale={locale} active={`/${locale}/konto/bestellungen`} email={user.email}>
      <h1>{t.orders}</h1>
      {orders.length === 0 ? <p className="muted">{t.noOrders}</p> :
        <div className="acct-orders">
          {orders.map(o => (
            <Link key={o.id} href={`/${locale}/konto/bestellung/${o.id}`} className="acct-order">
              <div className="acct-order__top"><b>{o.orderNumber ?? o.id.slice(0,8)}</b><span className="adm-tag">{CUSTOMER_STATUS[o.opStatus]?.[locale] ?? o.opStatus}</span></div>
              <div className="acct-order__meta"><span>{new Date(o.createdAt).toLocaleDateString(locale)}</span><span>{money(o.totalCents,o.currency,locale)}</span></div>
            </Link>
          ))}
        </div>}
    </AccountShell>
  );
}
