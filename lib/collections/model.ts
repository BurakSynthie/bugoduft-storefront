import type { Locale } from '@/i18n/config';
import { locales } from '@/i18n/config';

export type CollectionTr = { name: string; slug: string; description: string; seoTitle: string; seoDescription: string };
export type EditableCollection = {
  id: string; code: string; groupId: string; isActive: boolean; sortOrder: number;
  tr: Record<Locale, CollectionTr>;
};
export type CollectionResult<T = true> = { ok: true; data: T } | { ok: false; message: string; blockedBy?: string[] };
export const emptyCollTr = (): Record<Locale, CollectionTr> =>
  Object.fromEntries(locales.map(l => [l, { name:'', slug:'', description:'', seoTitle:'', seoDescription:'' }])) as Record<Locale, CollectionTr>;
