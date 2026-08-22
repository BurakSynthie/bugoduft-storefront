import Link from 'next/link';
import { requireAdmin } from '@/lib/supabase/admin-auth';
import { isSupabaseConfigured } from '@/lib/supabase/env';
import { listBlogPosts } from '@/repositories/admin-blog';

export const metadata = { title: 'Blog · BUGO DUFT' };
export const dynamic = 'force-dynamic';   // admin auth per-request; live DB list

function fmtDate(iso: string | null): string {
  if (!iso) return '—';
  try { return new Date(iso).toLocaleDateString('de-DE', { year: 'numeric', month: '2-digit', day: '2-digit' }); }
  catch { return '—'; }
}

export default async function AdminBlog() {
  await requireAdmin();
  const configured = isSupabaseConfigured();
  const rows = configured ? await listBlogPosts() : [];
  return (
    <>
      <div className="adm__top">
        <div><h1>Blog</h1><div className="adm__crumb">İçerik / Blog</div></div>
        <Link className="adm-btn adm-btn--primary" href="/admin/blog/yeni">+ Yeni yazı</Link>
      </div>

      {!configured && (
        <div className="adm-note" style={{ marginBottom: 'var(--s-4)' }}>
          <span>ⓘ</span><span>Supabase yapılandırılmadı — blog yazıları veritabanından okunur. Yapılandırınca liste burada görünür.</span>
        </div>
      )}

      <div className="adm-panel">
        {rows.length === 0 ? (
          <p className="muted">Henüz yazı yok. “Yeni yazı” ile ilk makaleyi oluşturun.</p>
        ) : (
          <>
            <table className="adm-table adm-hide-mobile">
              <thead><tr>
                <th>Başlık (DE)</th><th>Durum</th><th>Diller</th><th>Slug</th>
                <th>Yayın tarihi</th><th>Son değişiklik</th><th></th>
              </tr></thead>
              <tbody>
                {rows.map(r => (
                  <tr key={r.id}>
                    <td><strong>{r.titleDe}</strong></td>
                    <td>{r.status === 'published'
                      ? <span className="adm-tag">Yayında</span>
                      : <span className="adm-tag adm-tag--off">Taslak</span>}</td>
                    <td>{r.locales.map(l => l.toUpperCase()).join(' · ') || '—'}</td>
                    <td><code style={{ fontSize: '.8rem' }}>{r.primarySlug || '—'}</code></td>
                    <td>{fmtDate(r.publishedAt)}</td>
                    <td>{fmtDate(r.updatedAt)}</td>
                    <td style={{ textAlign: 'right' }}>
                      <Link className="adm-btn adm-btn--ghost" href={`/admin/blog/${r.id}`}>Düzenle</Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="adm-cardlist">
              {rows.map(r => (
                <div className="adm-ucard" key={r.id}>
                  <div className="adm-ucard__row">
                    <span className="adm-ucard__name">{r.titleDe}</span>
                    {r.status === 'published'
                      ? <span className="adm-tag">Yayında</span>
                      : <span className="adm-tag adm-tag--off">Taslak</span>}
                  </div>
                  <div className="adm-ucard__meta">
                    <span>{r.locales.map(l => l.toUpperCase()).join(' · ') || '—'}</span>
                    <span>{r.primarySlug || '—'}</span>
                    <span>{fmtDate(r.publishedAt)}</span>
                  </div>
                  <div className="adm-ucard__foot">
                    <Link className="adm-btn adm-btn--ghost" href={`/admin/blog/${r.id}`}>Düzenle</Link>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </>
  );
}
