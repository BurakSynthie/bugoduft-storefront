'use server';
import type { Locale } from '@/i18n/config';
import type { HomeExtra } from '@/data/seed/home-content';
import { saveHomepage, type HomeSaveResult } from '@/repositories/homepage';
export async function saveHomepageAction(content: Record<Locale, HomeExtra>): Promise<HomeSaveResult> {
  return saveHomepage(content);
}
