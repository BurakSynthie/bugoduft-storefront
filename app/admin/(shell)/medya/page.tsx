import { requireAdmin } from '@/lib/supabase/admin-auth';
export const metadata = { title: 'Medya · BUGO DUFT' };

// Media library — foundation. The schema (media, product_media) and storage plan
// land in this phase's migration; the upload/selection pipeline is wired in the
// next phase. Shown honestly as an empty state rather than fake controls.
export default async function AdminMedia() {
  await requireAdmin();
  return (
    <>
      <div className="adm__top">
        <div><h1>Medya</h1><div className="adm__crumb">Katalog / Medya</div></div>
      </div>
      <div className="adm-note" style={{ marginBottom:'var(--s-5)' }}>
        <span>ⓘ</span>
        <span>Medya altyapısı (tablolar ve RLS) bu fazın veritabanı göçüyle hazırlandı.
          Görsel/video yükleme ve ürünlere atama akışı bir sonraki fazda etkinleştirilecek.</span>
      </div>
      <div className="adm-panel">
        <strong>Kütüphane</strong>
        <p className="muted" style={{ marginTop:'var(--s-3)' }}>
          Henüz medya yok. Gerçek ürün görselleri yüklendiğinde burada listelenecek
          (JPG, PNG, WebP; MP4/WebM). Sahte içerik gösterilmez.
        </p>
      </div>
    </>
  );
}
