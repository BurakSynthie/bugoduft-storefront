import 'server-only';
import { revalidatePath } from 'next/cache';
import type { Locale } from '@/i18n/config';
import { locales } from '@/i18n/config';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { getAdminUser } from '@/lib/supabase/admin-auth';
import { isSupabaseConfigured } from '@/lib/supabase/env';
import { getHomeContent, type HomeExtra } from '@/data/seed/home-content';

// Homepage content is stored as a single localized JSONB document:
//   homepage_content.content = { de: HomeExtra, en: HomeExtra, fr: HomeExtra }
// Reads merge the stored locale over the shipped seed, so a partial/absent doc
// never empties the homepage — the storefront stays materially the same until
// content is intentionally changed in Admin.

function merge(seed: HomeExtra, over: Partial<HomeExtra> | undefined): HomeExtra {
  return over ? { ...seed, ...over } : seed;
}

async function readDoc(): Promise<Record<string, Partial<HomeExtra>> | null> {
  if (!isSupabaseConfigured()) return null;
  const sb = createSupabaseServerClient();
  if (!sb) return null;
  try {
    const { data } = await sb.from('homepage_content').select('content').eq('id', 'default').maybeSingle();
    return (data?.content as Record<string, Partial<HomeExtra>>) ?? null;
  } catch { return null; }
}

// Storefront read (DB-first, seed fallback).
export async function getHomeExtra(locale: Locale): Promise<HomeExtra> {
  const doc = await readDoc();
  return merge(getHomeContent(locale), doc?.[locale]);
}

// Admin read — effective content per locale to seed the editor.
export async function loadHomepageForEdit(): Promise<Record<Locale, HomeExtra>> {
  const doc = await readDoc();
  const out = {} as Record<Locale, HomeExtra>;
  for (const l of locales) out[l] = merge(getHomeContent(l), doc?.[l]);
  return out;
}

export type HomeSaveResult = { ok: true } | { ok: false; message: string };

export async function saveHomepage(content: Record<Locale, HomeExtra>): Promise<HomeSaveResult> {
  const admin = await getAdminUser();
  if (!admin) return { ok: false, message: 'Yetkisiz.' };
  const sb = createSupabaseServerClient();
  if (!sb) return { ok: false, message: 'Supabase yapılandırılmadı.' };
  const { error } = await sb.from('homepage_content')
    .upsert({ id: 'default', content, updated_by: admin.id, updated_at: new Date().toISOString() }, { onConflict: 'id' });
  if (error) return { ok: false, message: error.message };
  for (const l of locales) revalidatePath(`/${l}`);
  return { ok: true };
}
