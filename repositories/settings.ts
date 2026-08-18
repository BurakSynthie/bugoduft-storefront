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
  // §P1: never trust client-supplied commercial numbers. Clamp to safe server values —
  // non-negative integer cents, percent 0..100 — so a malformed admin payload can't store
  // a negative price/credit or an out-of-range discount.
  const intCents = (n: unknown, fallback: number) => {
    const v = Math.round(Number(n));
    return Number.isFinite(v) && v >= 0 ? v : fallback;
  };
  // §P2 EDGE-SAFETY: cap the first-order discount at 95% so a benefit can never drive the
  // payable total to €0 (a Draft Order requires a positive amount; the checkout would
  // otherwise fail closed). 0..95 is the supported range.
  const pct = (n: unknown, fallback: number) => {
    const v = Math.round(Number(n));
    return Number.isFinite(v) ? Math.min(95, Math.max(0, v)) : fallback;
  };
  const priceCents = intCents(content.commerce?.paidSample?.priceCents, 4000);
  // Credit can never exceed the sample price (you don't receive more credit than you paid).
  const creditCents = Math.min(priceCents, intCents(content.commerce?.paidSample?.creditCents, 2000));
  const commerce: SiteSettings['commerce'] = {
    paidSample: {
      enabled: Boolean(content.commerce?.paidSample?.enabled),
      priceCents,
      creditCents,
    },
    firstOrder: {
      enabled: Boolean(content.commerce?.firstOrder?.enabled),
      percent: pct(content.commerce?.firstOrder?.percent, 5),
    },
  };

  // Any explicit admin save makes the announcement section authoritative from now on —
  // `enabled: false` must then win over the shipped seed fallback (see layout.tsx).
  const toSave: SiteSettings = { ...content, commerce, announcement: { ...content.announcement, configured: true } };
  const { error } = await sb.from('site_settings')
    .upsert({ id: 'default', content: toSave, updated_by: admin.id, updated_at: new Date().toISOString() }, { onConflict: 'id' });
  if (error) return { ok: false, message: error.message };
  for (const l of locales) revalidatePath(`/${l}`, 'layout');   // announcement/footer live in the layout
  return { ok: true };
}
