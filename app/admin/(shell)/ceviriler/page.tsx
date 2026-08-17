import { requireAdmin } from '@/lib/supabase/admin-auth';
import { translationAudit } from '@/repositories/admin-audit';
import { locales } from '@/i18n/config';
export const metadata = { title: 'Çeviriler · BUGO DUFT' };
export const dynamic = 'force-dynamic';

export default async function AdminTranslations() {
  await requireAdmin();
  const groups = await translationAudit();
  const missing = groups.reduce((a, g) => a + g.items.filter(i => locales.some(l => !i.present[l])).length, 0);
  return (
    <>
      <div className="adm__top"><div><h1>Çeviriler</h1><div className="adm__crumb">İçerik / Çeviriler</div></div></div>
      <div className="adm-note" style={{ marginBottom:'var(--s-4)' }}><span>ⓘ</span>
        <span>CMS içeriğinin DE/EN/FR tamlığı. Eksik yerel değerler işaretlenir; düzenleme ilgili modülde
        (Ürünler / Koleksiyonlar / Kokular) yapılır. Teknik arayüz anahtarları burada tutulmaz.</span></div>
      {missing > 0 && <div className="adm-note" style={{ marginBottom:'var(--s-4)', background:'#FFF7E6', borderColor:'#F5D9A8' }}><span>⚠</span><span>{missing} kayıtta eksik çeviri var.</span></div>}
      {groups.length === 0 ? <div className="adm-panel"><p className="muted">Veri yok (Supabase yapılandırılmadı).</p></div> :
        groups.map(g => (
          <div className="adm-panel" key={g.kind}>
            <strong>{g.kind}</strong>
            <table className="adm-table" style={{ marginTop:'var(--s-3)' }}>
              <thead><tr><th>Kod</th>{locales.map(l => <th key={l}>{l.toUpperCase()}</th>)}</tr></thead>
              <tbody>
                {g.items.map(i => (
                  <tr key={i.id}>
                    <td>{i.code}</td>
                    {locales.map(l => <td key={l}>{i.present[l] ? <span className="adm-tag">✓</span> : <span className="adm-tag adm-tag--off">eksik</span>}</td>)}
                  </tr>
                ))}
                {!g.items.length && <tr><td colSpan={locales.length+1} className="muted">Kayıt yok.</td></tr>}
              </tbody>
            </table>
          </div>
        ))}
    </>
  );
}
