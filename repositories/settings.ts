import 'server-only';
import { revalidatePath } from 'next/cache';
import { locales } from '@/i18n/config';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { getAdminUser } from '@/lib/supabase/admin-auth';
import { isSupabaseConfigured } from '@/lib/supabase/env';
import { type SiteSettings, mergeSettings } from '@/lib/settings/model';

// Storefront read: DB-first, safe fallback to defaults (never blank).
export async function getSettings(): Promise<SiteSettings> {
  if (!isSupabaseConfigured()) return mergeSettings(null);
  const sb = createSupabaseServerClient();
  if (!sb) return mergeSettings(null);
  try {
    const { data } = await sb.from('site_settings').select('content').eq('id', 'default').maybeSingle();
    return mergeSettings((data?.content as Partial<SiteSettings>) ?? null);
  } catch { return mergeSettings(null); }
}

export type SettingsSaveResult = { ok: true } | { ok: false; message: string };

export async function saveSettings(content: SiteSettings): Promise<SettingsSaveResult> {
  const admin = await getAdminUser();
  if (!admin) return { ok: false, message: 'Yetkisiz.' };
  const sb = createSupabaseServerClient();
  if (!sb) return { ok: false, message: 'Supabase yapılandırılmadı.' };
  const { error } = await sb.from('site_settings')
    .upsert({ id: 'default', content, updated_by: admin.id, updated_at: new Date().toISOString() }, { onConflict: 'id' });
  if (error) return { ok: false, message: error.message };
  for (const l of locales) revalidatePath(`/${l}`, 'layout');   // announcement/footer live in the layout
  return { ok: true };
}
