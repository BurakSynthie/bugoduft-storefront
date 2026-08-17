import { requireAdmin } from '@/lib/supabase/admin-auth';
import { isSupabaseConfigured } from '@/lib/supabase/env';
import { loadScents } from '@/repositories/admin-scents';
import ScentsAdmin from './ScentsAdmin';
export const metadata = { title: 'Kokular · BUGO DUFT' };
export const dynamic = 'force-dynamic';
export default async function AdminScents() {
  await requireAdmin();
  const scents = await loadScents();
  return (
    <>
      <div className="adm__top"><div><h1>Kokular</h1><div className="adm__crumb">Katalog / Kokular</div></div></div>
      <ScentsAdmin initial={scents} configured={isSupabaseConfigured()} />
    </>
  );
}
