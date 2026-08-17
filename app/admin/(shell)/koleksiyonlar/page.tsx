import { requireAdmin } from '@/lib/supabase/admin-auth';
import { isSupabaseConfigured } from '@/lib/supabase/env';
import { loadCollections } from '@/repositories/admin-collections';
import CollectionsAdmin from './CollectionsAdmin';
export const metadata = { title: 'Koleksiyonlar · BUGO DUFT' };
export const dynamic = 'force-dynamic';
export default async function AdminCollections() {
  await requireAdmin();
  const cols = await loadCollections();
  return (
    <>
      <div className="adm__top"><div><h1>Koleksiyonlar</h1><div className="adm__crumb">Katalog / Koleksiyonlar</div></div></div>
      <CollectionsAdmin initial={cols} configured={isSupabaseConfigured()} />
    </>
  );
}
