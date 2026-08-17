import { requireAdmin } from '@/lib/supabase/admin-auth';
import { getDashboardMetrics, OP_STATUS_TR } from '@/repositories/orders';
import { formatMoney } from '@/lib/money';
import Link from 'next/link';
export const metadata = { title: 'Panel · BUGO DUFT' };
export const dynamic = 'force-dynamic';

export default async function AdminDashboard() {
  await requireAdmin();
  const m = await getDashboardMetrics();
  if (!m.configured) {
    return (<><div className="adm__top"><div><h1>Panel</h1><div className="adm__crumb">Genel bakış</div></div></div>
      <div className="adm-note"><span>ⓘ</span><span>Supabase henüz yapılandırılmadı. Gerçek veriye bağlanınca kartlar dolacaktır.</span></div></>);
  }
  const cards: [string, number][] = [
    ['Bugünkü siparişler', m.today],
    ['Sipariş Alındı', m.counts.received],
    ['Tasarım aşamasında', m.counts.design],
    ['Üretimde', m.counts.production],
    ['Kargolanan', m.counts.shipped],
    ['Toplam sipariş', m.total],
  ];
  return (
    <>
      <div className="adm__top"><div><h1>Panel</h1><div className="adm__crumb">Genel bakış</div></div></div>
      <div className="adm-cards">
        {cards.map(([k,v]) => <div className="adm-card" key={k}><div className="k">{k}</div><div className="v">{v}</div></div>)}
      </div>
      <div className="adm-panel">
        <strong>Son siparişler</strong>
        <table className="adm-table" style={{marginTop:'var(--s-4)'}}>
          <thead><tr><th>Sipariş No</th><th>Müşteri</th><th>Tutar</th><th>Durum</th><th>Tarih</th></tr></thead>
          <tbody>
            {m.recent.map((o:any)=>(
              <tr key={o.id}>
                <td><Link href={`/admin/siparisler/${o.id}`} style={{color:'var(--c-blue)',fontWeight:600}}>{o.bugo_number ?? '—'}</Link></td>
                <td>{o.company || [o.customer_first_name,o.customer_last_name].filter(Boolean).join(' ') || '—'}</td>
                <td>{o.total_paid_cents!=null?formatMoney(o.total_paid_cents,o.currency||'EUR','de'):'—'}</td>
                <td><span className={`op op--${o.op_status}`}>{OP_STATUS_TR[o.op_status as keyof typeof OP_STATUS_TR]}</span></td>
                <td>{new Date(o.created_at).toLocaleDateString('tr-TR')}</td>
              </tr>))}
            {!m.recent.length && <tr><td colSpan={5} className="muted">Henüz sipariş yok.</td></tr>}
          </tbody>
        </table>
      </div>
    </>
  );
}
