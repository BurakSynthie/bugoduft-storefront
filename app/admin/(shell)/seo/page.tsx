import Link from 'next/link';
import { requireAdmin } from '@/lib/supabase/admin-auth';
import { isSupabaseConfigured } from '@/lib/supabase/env';
import { seoAudit } from '@/repositories/admin-audit';
import { getSettings } from '@/repositories/settings';
import { locales } from '@/i18n/config';
import SeoEditor from './SeoEditor';
export const metadata = { title: 'SEO · BUGO DUFT' };
export const dynamic = 'force-dynamic';

const TITLE_MAX = 60, DESC_MAX = 160;
function flag(v: string, max: number) {
  const n = v.trim().length;
  if (n === 0) return { cls: 'adm-tag adm-tag--off', txt: 'eksik' };
  if (n > max) return { cls: 'adm-tag adm-tag--off', txt: `${n} (uzun)` };
  return { cls: 'adm-tag', txt: `${n}` };
}

const EDIT_ID: Record<string, string> = { 'BUGO-STD':'p-standard', 'BUGO-PRM':'p-premium', 'BUGO-DLX':'p-deluxe', 'BUGO-VIP':'p-vip' };

export default async function AdminSeo() {
  await requireAdmin();
  const [rows, settings] = await Promise.all([seoAudit(), getSettings()]);
  return (
    <>
      <div className="adm__top"><div><h1>SEO</h1><div className="adm__crumb">İçerik / SEO Yönetim Merkezi</div></div></div>

      {/* §H SEO management center: per-page DE/EN/FR title/description/H1/intro/OG + industry content */}
      <SeoEditor initial={settings} configured={isSupabaseConfigured()} />

      {/* Existing product SEO audit (per-product editor stays authoritative for product pages) */}
      <h2 style={{ fontSize:'1.05rem', margin:'var(--s-6) 0 var(--s-3)' }}>Ürün SEO denetimi</h2>
      <div className="adm-note" style={{ marginBottom:'var(--s-4)' }}><span>ⓘ</span>
        <span>Başlık ≤ {TITLE_MAX}, açıklama ≤ {DESC_MAX} karakter önerilir. Ürün metinleri ürün editöründe düzenlenir;
        eksik/uzun değerler burada işaretlenir. Canonical & hreflang gerçek yerelleştirilmiş slug’lardan üretilir.</span></div>
      <div className="adm-panel">
        {rows.length === 0 ? <p className="muted">Veri yok (Supabase yapılandırılmadı veya ürün yok).</p> :
        <table className="adm-table">
          <thead><tr><th>Ürün</th>{locales.map(l => <th key={l}>{l.toUpperCase()} başlık</th>)}{locales.map(l => <th key={l+'d'}>{l.toUpperCase()} açıklama</th>)}<th></th></tr></thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.id}>
                <td><strong>{r.code}</strong></td>
                {locales.map(l => { const f = flag(r.tr[l].title, TITLE_MAX); return <td key={l}><span className={f.cls}>{f.txt}</span></td>; })}
                {locales.map(l => { const f = flag(r.tr[l].description, DESC_MAX); return <td key={l+'d'}><span className={f.cls}>{f.txt}</span></td>; })}
                <td style={{ textAlign:'right' }}><Link className="adm-btn adm-btn--ghost" href={`/admin/urunler/${EDIT_ID[r.code] ?? ''}`}>Düzenle</Link></td>
              </tr>
            ))}
          </tbody>
        </table>}
      </div>
    </>
  );
}
