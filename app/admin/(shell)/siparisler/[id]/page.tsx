import { notFound } from 'next/navigation';
import { requireAdmin } from '@/lib/supabase/admin-auth';
import { getOrder, OP_STATUS_TR } from '@/repositories/orders';
import { getSettings } from '@/repositories/settings';
import { formatMoney, formatQty } from '@/lib/money';
import { StatusControl, TrackingControl, NotesControl, ArtworkLink } from './OrderControls';
export const metadata = { title: 'Sipariş · BUGO DUFT' };

function Addr({ a }:{ a:any }){ if(!a) return <span className="muted">—</span>;
  return <span>{[a.name,a.address1,a.address2,[a.zip,a.city].filter(Boolean).join(' '),a.country].filter(Boolean).join(', ')}</span>; }

export default async function OrderDetail({ params }:{ params: Promise<{ id:string }> }){
  const { id } = await params;                      // §HIGH-16 Next.js 15 async params
  await requireAdmin();
  const o:any = await getOrder(id);
  if(!o) notFound();
  const c = o.configurations ?? {};
  const so = o.sampleOrder ?? null;
  const reusedFrom = o.reusedFrom ?? null;
  const isSampleOrder = o.order_kind === 'sample';
  const settings = await getSettings();
  const samplePriceTxt = formatMoney(settings.commerce.paidSample.priceCents, 'EUR', 'de');
  const sampleCreditTxt = formatMoney(settings.commerce.paidSample.creditCents, 'EUR', 'de');
  const APPROVAL_TR: Record<string,string> = { pending:'Bekliyor', approved:'Onaylandı', revision:'Revizyon istendi' };
  const BENEFIT_TR: Record<string,string> = { sample_credit:`Numune Kredisi (${sampleCreditTxt})`, first_order_5pct:`İlk Sipariş İndirimi (${settings.commerce.firstOrder.percent}%)` };
  const SAMPLE_STATE_TR: Record<string,string> = { pending:'Bekliyor', paid:'Ödendi', cancelled:'İptal edildi' };
  const kv = (k:string,v:React.ReactNode)=>(<><dt>{k}</dt><dd>{v}</dd></>);
  return (
    <>
      <div className="adm__top">
        <div><h1>Sipariş No: {o.bugo_number ?? '—'}</h1>
          <div className="adm__crumb">Shopify: {o.shopify_order_name ?? o.shopify_order_id ?? '—'}{c.shopify_cart_id ? ` · Taslak: ${c.shopify_cart_id}` : ''}</div></div>
        <span style={{display:'flex',gap:'.5rem',alignItems:'center'}}>
          <span className="op op--received">{isSampleOrder ? `Numune Siparişi (${samplePriceTxt})` : 'Ana Sipariş'}</span>
          <span className={`op op--${o.op_status}`}>{OP_STATUS_TR[o.op_status as keyof typeof OP_STATUS_TR]}</span>
        </span>
      </div>

      <div className="adm-grid2">
        <div className="adm-panel"><strong>Müşteri</strong>
          <dl className="adm-kv" style={{marginTop:'var(--s-3)'}}>
            {kv('Ad Soyad',[o.customer_first_name,o.customer_last_name].filter(Boolean).join(' ')||'—')}
            {kv('Firma',o.company||'—')}
            {kv('E-posta',o.customer_email||'—')}
            {kv('Telefon',o.phone||'—')}
            {kv('Ödeme',o.payment_state||'—')}
            {kv('Hesaba bağlı',o.customer_id ? 'Evet (kayıtlı müşteri)' : 'Hayır (misafir)')}
            {kv('Fatura adresi',<Addr a={o.billing_address}/>)}
            {kv('Teslimat adresi',<Addr a={o.shipping_address}/>)}
          </dl>
        </div>
        <div className="adm-panel"><strong>{isSampleOrder ? 'Numune Seti' : 'Ürün & Fiyat'}</strong>
          <dl className="adm-kv" style={{marginTop:'var(--s-3)'}}>
            {isSampleOrder ? (
              <>
                {kv('Ürün','Duftmuster-Set (40 Düfte)')}
                {kv('Tutar',o.total_paid_cents!=null?formatMoney(o.total_paid_cents,o.currency||'EUR','de'):'40,00 €')}
                {so && kv('Sonraki siparişte tanınacak kredi',formatMoney(so.credit_cents,'EUR','de'))}
                {so && kv('Kredi kullanıldı mı?',so.credit_used_at ? `Evet — ${new Date(so.credit_used_at).toLocaleDateString('de-DE')}` : 'Henüz kullanılmadı')}
              </>
            ) : (
              <>
                {kv('Kollektion',c.collection_code||'—')}
                {kv('Menge',c.quantity!=null?`${formatQty(c.quantity,'de')} Stück`:'—')}
                {kv('Duft',c.scent_code||'—')}
                {c.scent_code_2 && kv('Duft 2 (kostenlos)',c.scent_code_2)}
                {kv('Duftintensität',c.intensity==='intense'?`Intensivduft (+${formatMoney(c.surcharge_cents ?? 0,'EUR','de')}${c.quantity?` · ${formatMoney(Math.round((c.surcharge_cents ?? 0)/(c.quantity/1000)),'EUR','de')}/1.000`:''})`:'Normalduft')}
                {kv('Form',c.shape||'—')}
                {kv('Designmodus',c.design_mode==='ready_file'?'Fertige Druckdatei':'BUGO erstellt Design')}
                {c.unit_rate_cents!=null && kv('Fiyat / 1.000',formatMoney(c.unit_rate_cents,'EUR','de'))}
                {c.savings_cents>0 && kv('Miktar Tasarrufu (Ersparnis)',formatMoney(c.savings_cents,'EUR','de'))}
                {c.free_sample_set && kv('40-Düfte Musterset (ücretsiz)',`kostenlos inklusive${c.free_sample_source?` · ${c.free_sample_source}`:''}`)}
                {c.pre_benefit_total_cents!=null && kv('Ara Toplam (avantaj öncesi)',formatMoney(c.pre_benefit_total_cents,'EUR','de'))}
                {c.benefit_type && kv('Uygulanan Avantaj',BENEFIT_TR[c.benefit_type as string] ?? c.benefit_type)}
                {c.benefit_type && kv('Avantaj Tutarı',formatMoney(c.benefit_amount_cents||0,'EUR','de'))}
                {c.benefit_type==='sample_credit' && so && kv('Kredi Kaynağı (Numune Siparişi)',`${so.id.slice(0,8)} · ${SAMPLE_STATE_TR[so.payment_state] ?? so.payment_state}`)}
                {c.total_price_cents!=null && kv('Nihai Toplam (BUGO)',`${(c.total_price_cents/100).toFixed(2)} €`)}
                {kv('Ödenen Tutar',o.total_paid_cents!=null?formatMoney(o.total_paid_cents,o.currency||'EUR','de'):(c.total_price_cents!=null?formatMoney(c.total_price_cents,'EUR','de'):'—'))}
                {kv('Yeniden Sipariş (Tasarım Kullanımı)',reusedFrom ? `Evet — önceki konfigürasyon ${reusedFrom.id.slice(0,8)} (${reusedFrom.collection_code ?? '—'}, ${reusedFrom.quantity ?? '—'} adet)` : 'Hayır — yeni tasarım')}
              </>
            )}
          </dl>
        </div>
      </div>

      {!isSampleOrder && (
      <div className="adm-panel"><strong>Tasarım Onayı</strong>
        <dl className="adm-kv" style={{marginTop:'var(--s-3)'}}>
          {kv('Onay Durumu',APPROVAL_TR[o.approval_state as string] ?? o.approval_state ?? '—')}
          {kv('Onay Notu',o.approval_note || '—')}
        </dl>
      </div>
      )}

      {!isSampleOrder && (
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
      )}

      {!isSampleOrder && Array.isArray(c.supporting) && c.supporting.length>0 &&
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
