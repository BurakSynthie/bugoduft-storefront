import { requireAdmin } from '@/lib/supabase/admin-auth';
import { isSupabaseConfigured } from '@/lib/supabase/env';
import { getSettings } from '@/repositories/settings';
import SettingsEditor from './SettingsEditor';
export const metadata = { title: 'Ayarlar · BUGO DUFT' };
export const dynamic = 'force-dynamic';
export default async function AdminSettings() {
  await requireAdmin();
  const settings = await getSettings();
  return (
    <>
      <div className="adm__top"><div><h1>Ayarlar</h1><div className="adm__crumb">Genel ayarlar</div></div></div>
      <SettingsEditor initial={settings} configured={isSupabaseConfigured()} />
    </>
  );
}
