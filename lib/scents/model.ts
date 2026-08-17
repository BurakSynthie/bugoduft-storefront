import type { Locale } from '@/i18n/config';
import { locales } from '@/i18n/config';

export const SCENT_CATEGORIES = ['frisch','fruchtig','suess','elegant','intensiv'] as const;
export type ScentTr = { name: string; description: string };
export type EditableScent = {
  id: string | null;                 // null = new (not yet persisted)
  code: string; category: string; isActive: boolean; featured: boolean; sortOrder: number;
  tr: Record<Locale, ScentTr>;
};
export type ScentResult<T = true> = { ok: true; data: T } | { ok: false; message: string; blockedBy?: string[] };
export const emptyScentTr = (): Record<Locale, ScentTr> =>
  Object.fromEntries(locales.map(l => [l, { name:'', description:'' }])) as Record<Locale, ScentTr>;
