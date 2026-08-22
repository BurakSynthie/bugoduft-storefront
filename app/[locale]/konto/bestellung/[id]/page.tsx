import { redirect, notFound } from 'next/navigation';
import { isLocale, type Locale } from '@/i18n/config';
import { getCustomerUser, ensureCustomerRow, getCustomerOrder } from '@/lib/customer/session';
import { ACCOUNT_COPY, APPROVAL_COPY, CUSTOMER_STATUS, STATUS_ORDER, trackingUrl } from '@/lib/customer/copy';
import AccountShell from '@/components/account/AccountShell';
import ReorderButton from '@/components/account/ReorderButton';
export const dynamic = 'force-dynamic';
const money = (c:number,cur:string,l:Locale)=> new Intl.NumberFormat(l==='de'?'de-DE':l==='en'?'en-IE':'fr-FR',{style:'currency',currency:cur||'EUR'}).format(c/100);
const pick = (o:any,...k:string[])=>{ for(const x of k){ if(o&&o[x]!=null&&o[x]!=='') return o[x]; } return null; };

export default async function OrderDetail({ params }: { params: Promise<{ locale:string; id:string }> }) {
  const { locale: lp, id } = await params;          // §HIGH-16 Next.js 15 async params
  if (!isLocale(lp)) notFound();
  const locale = lp as Locale;
  const user = await getCustomerUser();
  if (!user) redirect(`/${locale}/konto/anmelden`);
  await ensureCustomerRow(user);
  const o = await getCustomerOrder(id);
  if (!o) notFound();
  const t = ACCOUNT_COPY[locale]; const ap = APPROVAL_COPY[locale];
  const cur = STATUS_ORDER.indexOf(o.opStatus as any);
  const it = o.items[0]?.config ?? {};
  const collectionCode = pick(it,'collectionCode','collection_code','collection');
  const seed = {
    collectionCode: collectionCode ?? undefined,
    quantity: o.items[0]?.quantity ?? undefined,
    scentCode: pick(it,'scentCode','scent_code','scent'),
    scentCode2: pick(it,'scentCode2','scent_code_2'),
    shape: pick(it,'shape') ?? undefined,
    intensity: pick(it,'intensity') ?? undefined,
  };
  const scent1Label = locale==='de'?'Duft 1':locale==='en'?'Scent 1':'Parfum 1';
  const scent2Label = locale==='de'?'Duft 2':locale==='en'?'Scent 2':'Parfum 2';
  const shapeLabel = locale==='de'?'Form':locale==='en'?'Shape':'Forme';
  const track = trackingUrl(o.carrier, o.trackingNumber);
  const approvalMsg = o.approvalState==='approved'?ap.approved : o.approvalState==='revision'?ap.revision : ap.pendingBody;

  return (
    <AccountShell locale={locale} active={`/${locale}/konto/bestellungen`} email={user.email}>
      <h1>{o.orderNumber ?? o.id.slice(0,8)}</h1>
      <p className="muted">{new Date(o.createdAt).toLocaleString(locale)} · {money(o.totalCents,o.currency,locale)}</p>

      {/* customer status timeline */}
      <ol className="acct-timeline">
        {STATUS_ORDER.map((s,i)=>(
          <li key={s} className={i<=cur?'is-done':''} aria-current={i===cur?'step':undefined}>
            <span className="acct-timeline__dot" />{CUSTOMER_STATUS[s][locale]}
          </li>
        ))}
      </ol>

      {/* approval communication */}
      <div className={`acct-approval acct-approval--${o.approvalState}`}>
        <strong>{ap.pendingTitle}</strong>
        <p className="muted">{approvalMsg}</p>
      </div>

      {/* items */}
      <div className="acct-block">
        {o.items.map((item,idx)=>(
          <dl className="acct-dl" key={idx}>
            <div><dt>{t.quantity}</dt><dd>{item.quantity}</dd></div>
            {pick(item.config,'scentName','scentCode','scent_code','scent') && <div><dt>{scent1Label}</dt><dd>{pick(item.config,'scentName','scentCode','scent_code','scent')}</dd></div>}
            {pick(item.config,'scentName2','scentCode2','scent_code_2') && <div><dt>{scent2Label}</dt><dd>{pick(item.config,'scentName2','scentCode2','scent_code_2')}</dd></div>}
            {pick(item.config,'shapeLabel','shape') && <div><dt>{shapeLabel}</dt><dd>{pick(item.config,'shapeLabel','shape')}</dd></div>}
          </dl>
        ))}
      </div>

      {/* tracking */}
      {o.opStatus==='shipped' && o.trackingNumber && (
        <div className="acct-block">
          <strong>{t.track}</strong>
          <p className="muted">{o.carrier ? `${o.carrier} · ` : ''}{o.trackingNumber}</p>
          {track && <a className="btn btn--dark" href={track} target="_blank" rel="noopener noreferrer">{t.track}</a>}
        </div>
      )}

      {/* reorder */}
      <div className="acct-block">
        <ReorderButton locale={locale} seed={seed} collectionCode={collectionCode} label={t.reorder} orderId={o.id} />
      </div>
    </AccountShell>
  );
}
