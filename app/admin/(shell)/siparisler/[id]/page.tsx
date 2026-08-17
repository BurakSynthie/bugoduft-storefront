import { notFound } from 'next/navigation';
import { requireAdmin } from '@/lib/supabase/admin-auth';
import { getOrder, OP_STATUS_TR } from '@/repositories/orders';
import { formatMoney, formatQty } from '@/lib/money';
import { StatusControl, TrackingControl, NotesControl, ArtworkLink } from './OrderControls';
export const metadata = { title: 'Sipariş · BUGO DUFT' };

function Addr({ a }:{ a:any }){ if(!a) return <span className="muted">—</span>;
  return <span>{[a.name,a.address1,a.address2,[a.zip,a.city].filter(Boolean).join(' '),a.country].filter(Boolean).join(', ')}</span>; }

export default async function OrderDetail({ params }:{ params:{ id:string } }){
  await requireAdmin();
  const o:any = await getOrder(params.id);
  if(!o) notFound();
  const c = o.configurations ?? {};
  const kv = (k:string,v:React.ReactNode)=>(<><dt>{k}</dt><dd>{v}</dd></>);
  return (
    <>
      <div className="adm__top">
        <div><h1>Sipariş No: {o.bugo_number ?? '—'}</h1>
          <div className="adm__crumb">Shopify: {o.shopify_order_name ?? o.shopify_order_id ?? '—'}</div></div>
        <span className={`op op--${o.op_status}`}>{OP_STATUS_TR[o.op_status as keyof typeof OP_STATUS_TR]}</span>
      </div>

      <div className="adm-grid2">
        <div className="adm-panel"><strong>Müşteri</strong>
          <dl className="adm-kv" style={{marginTop:'var(--s-3)'}}>
            {kv('Ad Soyad',[o.customer_first_name,o.customer_last_name].filter(Boolean).join(' ')||'—')}
            {kv('Firma',o.company||'—')}
            {kv('E-posta',o.customer_email||'—')}
            {kv('Telefon',o.phone||'—')}
            {kv('Ödeme',o.payment_state||'—')}
            {kv('Fatura adresi',<Addr a={o.billing_address}/>)}
            {kv('Teslimat adresi',<Addr a={o.shipping_address}/>)}
          </dl>
        </div>
        <div className="adm-panel"><strong>Ürün & Fiyat</strong>
          <dl className="adm-kv" style={{marginTop:'var(--s-3)'}}>
            {kv('Kollektion',c.collection_code||'—')}
            {kv('Menge',c.quantity!=null?`${formatQty(c.quantity,'de')} Stück`:'—')}
            {kv('Duft',c.scent_code||'—')}
            {c.scent_code_2 && kv('Duft 2 (kostenlos)',c.scent_code_2)}
            {kv('Duftintensität',c.intensity==='intense'?'Intensivduft (+30,00 €)':'Normalduft')}
            {kv('Form',c.shape||'—')}
            {kv('Designmodus',c.design_mode==='ready_file'?'Fertige Druckdatei':'BUGO erstellt Design')}
            {c.free_sample_set && kv('40-Düfte Musterset','kostenlos inklusive')}
            {c.total_price_cents!=null && kv('Gesamtpreis (BUGO)',`${(c.total_price_cents/100).toFixed(2)} €`)}
            {kv('Preis',o.total_paid_cents!=null?formatMoney(o.total_paid_cents,o.currency||'EUR','de'):(c.total_price_cents!=null?formatMoney(c.total_price_cents,'EUR','de'):'—'))}
          </dl>
        </div>
      </div>

      <div className="adm-grid2">
        <div className="adm-panel"><strong>Vorderseite</strong>
          <div style={{marginTop:'var(--s-3)',display:'grid',gap:'.5rem'}}>
            <ArtworkLink path={c.front_path} label="Vorderseite indir"/>
            <div><span className="muted" style={{fontSize:'.8rem'}}>Anmerkungen:</span><div>{c.front_instructions||'—'}</div></div>
          </div>
        </div>
        <div className="adm-panel"><strong>Rückseite</strong>
          <div style={{marginTop:'var(--s-3)',display:'grid',gap:'.5rem'}}>
            {c.same_back_as_front
              ? <span className="op op--received">identisch mit Vorderseite</span>
              : <ArtworkLink path={c.back_path} label="Rückseite indir"/>}
            <div><span className="muted" style={{fontSize:'.8rem'}}>Anmerkungen:</span><div>{c.same_back_as_front?'identisch':(c.back_instructions||'—')}</div></div>
          </div>
        </div>
      </div>

      {Array.isArray(c.supporting) && c.supporting.length>0 &&
        <div className="adm-panel"><strong>Weitere Dateien</strong>
          <div className="adm-toolbar" style={{marginTop:'var(--s-3)'}}>
            {c.supporting.map((f:any,i:number)=><ArtworkLink key={i} path={f.path} label={`Datei ${i+1}`}/>)}
          </div></div>}

      <StatusControl id={o.id} current={o.op_status}/>
      <TrackingControl id={o.id} tracking={o.tracking_number}/>
      <NotesControl id={o.id} notes={o.admin_notes}/>
    </>
  );
}
