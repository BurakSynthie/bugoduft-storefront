'use server';
import { saveSettings, type SettingsSaveResult } from '@/repositories/settings';
import type { SiteSettings } from '@/lib/settings/model';

// §H/§K SEO management center + industry content persistence. Reuses the settings doc
// (single source) and the existing admin-guarded saveSettings (getAdminUser check inside).
// Canonical/hreflang/JSON-LD/sitemap/robots are NOT part of this payload — they stay
// automatic. Callers pass the full merged settings object back.
export async function saveSeoSettingsAction(content: SiteSettings): Promise<SettingsSaveResult> {
  return saveSettings(content);
}
