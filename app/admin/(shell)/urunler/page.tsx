import Link from 'next/link';
import { products } from '@/data/seed/products';
import { formatMoney } from '@/lib/money';
export const metadata = { title: 'Ürünler · BUGO DUFT' };
// Product list (Turkish admin). Reads the same seed the storefront reads (single source).
export default function AdminProducts() {
  return (
    <>
      <div className="adm__top">
        <div><h1>Ürünler</h1><div className="adm__crumb">Katalog / Ürünler</div></div>
        <button className="adm-btn adm-btn--primary">+ Yeni ürün</button>
      </div>
      <div className="adm-panel">
        <table className="adm-table adm-hide-mobile">
          <thead><tr><th>Ürün (DE)</th><th>Kod</th><th>Koleksiyon</th><th>Başlangıç fiyatı</th><th>Durum</th><th></th></tr></thead>
          <tbody>
            {products.map(p => (
              <tr key={p.id}>
                <td>{p.tr.de.name}</td>
                <td>{p.productCode}</td>
                <td>{p.collectionCode}</td>
                <td>{formatMoney(p.basePriceCents, p.currency, 'de')}</td>
                <td>{p.isActive ? <span className="adm-tag">Yayında</span> : <span className="adm-tag adm-tag--off">Pasif</span>}</td>
                <td style={{ textAlign:'right' }}><Link className="adm-btn adm-btn--ghost" href={`/admin/urunler/${p.id}`}>Düzenle</Link></td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="adm-cardlist">
          {products.map(p => (
            <div className="adm-ucard" key={p.id}>
              <div className="adm-ucard__row">
                <span className="adm-ucard__name">{p.tr.de.name}</span>
                {p.isActive ? <span className="adm-tag">Yayında</span> : <span className="adm-tag adm-tag--off">Pasif</span>}
              </div>
              <div className="adm-ucard__meta">
                <span>{p.productCode}</span><span>{p.collectionCode}</span>
                <span>{formatMoney(p.basePriceCents, p.currency, 'de')}</span>
              </div>
              <div className="adm-ucard__foot">
                <Link className="adm-btn adm-btn--ghost" href={`/admin/urunler/${p.id}`}>Düzenle</Link>
              </div>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
