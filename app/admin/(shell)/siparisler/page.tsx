import { requireAdmin } from '@/lib/supabase/admin-auth';
import { listOrders, OP_STATUS_TR } from '@/repositories/orders';
import { formatMoney, formatQty } from '@/lib/money';
import Link from 'next/link';
export const metadata = { title: 'Siparişler · BUGO DUFT' };

export default async function OrdersList({ searchParams }:{ searchParams:{ q?:string; status?:string; sort?:string } }) {
  await requireAdmin();
  const sort = searchParams.sort==='old' ? 'old' : 'new';
  const { configured, rows } = await listOrders({ q:searchParams.q, status:searchParams.status, sort });
  return (
    <>
      <div className="adm__top"><div><h1>Siparişler</h1><div className="adm__crumb">Operasyon / Siparişler</div></div></div>
      {!configured && <div className="adm-note"><span>ⓘ</span><span>Supabase yapılandırılmadı.</span></div>}
      <form className="adm-toolbar" method="get">
        <input className="input" name="q" placeholder="Ara: no, e-posta, firma" defaultValue={searchParams.q ?? ''} />
        <select className="select" name="status" defaultValue={searchParams.status ?? ''}>
          <option value="">Tüm durumlar</option>
          {Object.entries(OP_STATUS_TR).map(([k,v])=><option key={k} value={k}>{v}</option>)}
        </select>
        <select className="select" name="sort" defaultValue={sort}>
          <option value="new">En yeni</option><option value="old">En eski</option>
        </select>
        <button className="adm-btn adm-btn--primary" type="submit">Uygula</button>
      </form>
      <div className="adm-panel">
        <table className="adm-table">
          <thead><tr><th>No</th><th>Müşteri / Firma</th><th>Ürün</th><th>Adet</th><th>Tutar</th><th>Durum</th><th>Tarih</th></tr></thead>
          <tbody>
            {rows.map((o:any)=>(
              <tr key={o.id}>
                <td><Link href={`/admin/siparisler/${o.id}`} style={{color:'var(--c-blue)',fontWeight:600}}>{o.bugo_number ?? '—'}</Link></td>
                <td>{o.company || [o.customer_first_name,o.customer_last_name].filter(Boolean).join(' ') || o.customer_email || '—'}</td>
                <td>{o.configurations?.collection_code ?? '—'}</td>
                <td>{o.configurations?.quantity!=null?`${formatQty(o.configurations.quantity,'de')} Stück`:'—'}</td>
                <td>{o.total_paid_cents!=null?formatMoney(o.total_paid_cents,o.currency||'EUR','de'):'—'}</td>
                <td><span className={`op op--${o.op_status}`}>{OP_STATUS_TR[o.op_status as keyof typeof OP_STATUS_TR]}</span></td>
                <td>{new Date(o.created_at).toLocaleDateString('tr-TR')}</td>
              </tr>))}
            {!rows.length && <tr><td colSpan={7} className="muted">Sipariş bulunamadı.</td></tr>}
          </tbody>
        </table>
      </div>
    </>
  );
}
