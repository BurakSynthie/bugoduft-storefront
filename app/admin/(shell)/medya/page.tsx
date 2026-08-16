import { requireAdmin } from '@/lib/supabase/admin-auth';
import { isSupabaseConfigured } from '@/lib/supabase/env';
import { listMediaAction } from '@/lib/media/actions';
import MediaLibrary from './MediaLibrary';
export const metadata = { title: 'Medya · BUGO DUFT' };
export const dynamic = 'force-dynamic';

export default async function AdminMedia() {
  await requireAdmin();
  const configured = isSupabaseConfigured();
  const res = await listMediaAction();
  const initial = res.ok ? res.data : [];
  return (
    <>
      <div className="adm__top">
        <div><h1>Medya</h1><div className="adm__crumb">Katalog / Medya</div></div>
      </div>
      <MediaLibrary initial={initial} configured={configured} />
    </>
  );
}
