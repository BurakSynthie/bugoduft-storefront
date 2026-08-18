import { redirect, notFound } from 'next/navigation';
import Link from 'next/link';
import { isLocale, type Locale } from '@/i18n/config';
import { getCustomerUser, ensureCustomerRow, getCustomerOrders, getSavedConfigs, getMyQuotes } from '@/lib/customer/session';
import { ACCOUNT_COPY, APPROVAL_COPY } from '@/lib/customer/copy';
import AccountShell from '@/components/account/AccountShell';
import { configuratorPath } from '@/lib/routing';
export const dynamic = 'force-dynamic';

export default async function Dashboard({ params }: { params:{ locale:string } }) {
  if (!isLocale(params.locale)) notFound();
  const locale = params.locale as Locale;
  const user = await getCustomerUser();
  if (!user) redirect(`/${locale}/konto/anmelden`);
  await ensureCustomerRow(user);
  const t = ACCOUNT_COPY[locale]; const ap = APPROVAL_COPY[locale];
  const [orders, saved, quotes] = await Promise.all([getCustomerOrders(), getSavedConfigs(), getMyQuotes(user.email)]);

  return (
    <AccountShell locale={locale} active={`/${locale}/konto`} email={user.email}>
      <h1>{t.account}</h1>
      <div className="acct-note"><strong>{ap.pendingTitle}</strong><p className="muted">{ap.pendingBody}</p></div>

      <div className="acct-cards">
        <Link className="acct-card" href={`/${locale}/konto/bestellungen`}><b>{t.orders}</b><span>{orders.length}</span></Link>
        <div className="acct-card"><b>{t.saved}</b><span>{saved.length}</span></div>
        <div className="acct-card"><b>{t.quotes}</b><span>{quotes.length}</span></div>
      </div>

      {saved.length > 0 && (
        <div className="acct-block" style={{ alignItems:'stretch' }}>
          <strong>{t.saved}</strong>
          {saved.slice(0,5).map(s => (
            <div key={s.id} className="acct-order__meta">
              <span>{s.label ?? s.collectionCode ?? s.productCode ?? '—'}</span>
              <span style={{ display:'flex', gap:'.75rem', alignItems:'center' }}>
                {new Date(s.updatedAt).toLocaleDateString(locale)}
                {s.collectionCode && (
                  <Link className="linkbtn" href={configuratorPath(locale, s.collectionCode)}>{t.continueDraft}</Link>
                )}
              </span>
            </div>
          ))}
        </div>
      )}
      {quotes.length > 0 && (
        <div className="acct-block" style={{ alignItems:'stretch' }}>
          <strong>{t.quotes}</strong>
          {quotes.slice(0,5).map(q => (
            <div key={q.id} className="acct-order__meta"><span>{q.productCode ?? '—'}{q.quantity?` · ${q.quantity}`:''}</span><span>{new Date(q.createdAt).toLocaleDateString(locale)}</span></div>
          ))}
        </div>
      )}

      <div className="acct-block" style={{ alignItems:'stretch' }}>
        <strong>{ACCOUNT_COPY[locale].account}</strong>
        <div className="acct-order__meta"><span>{ACCOUNT_COPY[locale].email}</span><span>{user.email}</span></div>
        <Link className="btn btn--dark" href={configuratorPath(locale)} style={{ alignSelf:'flex-start' }}>{t.startNew}</Link>
      </div>
    </AccountShell>
  );
}
