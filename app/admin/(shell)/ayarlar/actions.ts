'use server';
import { saveSettings, type SettingsSaveResult } from '@/repositories/settings';
import type { SiteSettings } from '@/lib/settings/model';
export async function saveSettingsAction(content: SiteSettings): Promise<SettingsSaveResult> { return saveSettings(content); }
