import { requireAdmin } from '@/lib/supabase/admin-auth';
import { isSupabaseConfigured } from '@/lib/supabase/env';
import { loadHomepageForEdit } from '@/repositories/homepage';
import HomeEditor from './HomeEditor';
export const metadata = { title: 'Ana Sayfa · BUGO DUFT' };
export const dynamic = 'force-dynamic';

export default async function AdminHomepage() {
  await requireAdmin();
  const initial = await loadHomepageForEdit();
  return (
    <>
      <div className="adm__top">
        <div><h1>Ana Sayfa</h1><div className="adm__crumb">İçerik / Ana Sayfa</div></div>
      </div>
      <HomeEditor initial={initial} configured={isSupabaseConfigured()} />
    </>
  );
}
