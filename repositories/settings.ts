import 'server-only';
import { revalidatePath } from 'next/cache';
import { locales } from '@/i18n/config';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { getAdminUser } from '@/lib/supabase/admin-auth';
import { isSupabaseConfigured } from '@/lib/supabase/env';
import { type SiteSettings, mergeSettings } from '@/lib/settings/model';
import { listIndustries as listSeedIndustries } from './catalog';

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

// §HIGH-8 AUTHORITATIVE settings read for MONEY decisions (first-order eligibility). Unlike
// getSettings() — which intentionally falls back to defaults so the storefront never renders
// blank — this distinguishes "loaded" from "could not load". A benefit-granting caller must NOT
// silently fall back to defaults (which have firstOrder.enabled = true): if the authoritative
// settings cannot be read, `loaded` is false and the caller fails closed to NO discount.
//   loaded:true  when Supabase is unconfigured (dev seed) OR the row was read without error.
//   loaded:false ONLY when a configured DB read errored — i.e. state is genuinely unknown.
export async function getSettingsAuthoritative(): Promise<{ loaded: boolean; settings: SiteSettings }> {
  if (!isSupabaseConfigured()) return { loaded: true, settings: mergeSettings(null) };
  const sb = createSupabaseServerClient();
  if (!sb) return { loaded: true, settings: mergeSettings(null) };
  try {
    const { data, error } = await sb.from('site_settings').select('content').eq('id', 'default').maybeSingle();
    if (error) return { loaded: false, settings: mergeSettings(null) };   // §HIGH-8 unknown → fail closed
    return { loaded: true, settings: mergeSettings((data?.content as Partial<SiteSettings>) ?? null) };
  } catch { return { loaded: false, settings: mergeSettings(null) }; }    // §HIGH-8 unknown → fail closed
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

  // §F Business facts: clamp numeric factual values to safe non-negative integers so a
  // malformed admin payload can't store nonsense. These feed informational copy only —
  // checkout pricing is NEVER driven by them (that stays server-authoritative).
  const nonNegInt = (n: unknown, fallback: number) => {
    const v = Math.round(Number(n));
    return Number.isFinite(v) && v >= 0 ? v : fallback;
  };
  const bf = content.businessFacts;
  // §4 SINGLE AUTHORITY: the free-sample threshold and paid-sample price/credit have exactly
  // one authoritative home — settings.sample.threshold and commerce.paidSample.*. The
  // businessFacts.{freeSampleThreshold,paidSamplePriceEur,paidSampleCreditEur} fields are kept
  // only as informational MIRRORS and are DERIVED here from the authoritative values on every
  // save, so they can never drift into a second source of truth. The admin Commercial Facts
  // panel edits the authoritative fields directly.
  const authoritativeThreshold = nonNegInt(content.sample?.threshold, 5000);
  const sample: SiteSettings['sample'] = {
    enabled: content.sample?.enabled !== false,
    threshold: authoritativeThreshold,
    valueEur: nonNegInt(content.sample?.valueEur, 40),
  };
  const businessFacts: SiteSettings['businessFacts'] = {
    ...bf,
    minOrderQty: nonNegInt(bf?.minOrderQty, 1000),
    qtyStep: nonNegInt(bf?.qtyStep, 1000),
    productionMinDays: nonNegInt(bf?.productionMinDays, 10),
    productionMaxDays: nonNegInt(bf?.productionMaxDays, 12),
    deliveryMinDays: nonNegInt(bf?.deliveryMinDays, 15),
    deliveryMaxDays: nonNegInt(bf?.deliveryMaxDays, 17),
    shippingIncluded: Boolean(bf?.shippingIncluded),
    customsIncluded: Boolean(bf?.customsIncluded),
    // Mirrors DERIVED from authoritative commerce/sample settings (never independent):
    freeSampleThreshold: authoritativeThreshold,           // = settings.sample.threshold
    paidSamplePriceEur: Math.round(priceCents / 100),      // = commerce.paidSample.priceCents
    paidSampleCreditEur: Math.round(creditCents / 100),    // = commerce.paidSample.creditCents
  };

  // Dynamic industry pages are admin-managed content, but routes must remain safe.
  // Validate IDs and locale slugs before persisting so one malformed admin payload
  // cannot create duplicate or ambiguous public URLs.
  const rawIndustries = Array.isArray(content.customIndustries) ? content.customIndustries.slice(0, 100) : [];
  const customIndustries: SiteSettings['customIndustries'] = [];
  const seenIds = new Set<string>();
  const seenSlugs = Object.fromEntries(
    locales.map(l => [l, new Set(listSeedIndustries(l).map(i => i.slug))])
  ) as Record<(typeof locales)[number], Set<string>>;

  const clean = (v: unknown, max: number) =>
    typeof v === 'string' ? v.trim().slice(0, max) : '';
  const slugRe = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

  for (const raw of rawIndustries) {
    const id = clean(raw?.id, 80);
    if (!id) return { ok: false, message: 'Sektor kimligi eksik.' };
    if (seenIds.has(id)) return { ok: false, message: 'Ayni sektor kimligi birden fazla kez kullanilamaz.' };
    seenIds.add(id);

    const item: SiteSettings['customIndustries'][number] = {
      id,
      active: raw?.active !== false,
      name: { de:'', en:'', fr:'' },
      slug: { de:'', en:'', fr:'' },
      h1: { de:'', en:'', fr:'' },
      body: { de:'', en:'', fr:'' },
      seoTitle: { de:'', en:'', fr:'' },
      seoDescription: { de:'', en:'', fr:'' },
      ogImage: clean(raw?.ogImage, 2048) || null,
    };

    for (const l of locales) {
      item.name[l] = clean(raw?.name?.[l], 160);
      item.slug[l] = clean(raw?.slug?.[l], 120).toLowerCase();
      item.h1[l] = clean(raw?.h1?.[l], 220);
      item.body[l] = clean(raw?.body?.[l], 5000);
      item.seoTitle[l] = clean(raw?.seoTitle?.[l], 180);
      item.seoDescription[l] = clean(raw?.seoDescription?.[l], 500);

      if (item.active && (!item.name[l] || !item.slug[l] || !item.h1[l] || !item.body[l])) {
        return { ok: false, message: `Aktif sektor icin ${l.toUpperCase()} ad, slug, H1 ve icerik zorunludur.` };
      }
      if (item.slug[l] && !slugRe.test(item.slug[l])) {
        return { ok: false, message: `${l.toUpperCase()} slug yalnizca a-z, 0-9 ve tire icerebilir.` };
      }
      if (item.slug[l] && seenSlugs[l].has(item.slug[l])) {
        return { ok: false, message: `${l.toUpperCase()} slug zaten kullaniliyor: ${item.slug[l]}` };
      }
      if (item.slug[l]) seenSlugs[l].add(item.slug[l]);
    }

    customIndustries.push(item);
  }
  // Any explicit admin save makes the announcement section authoritative from now on —
  // `enabled: false` must then win over the shipped seed fallback (see layout.tsx).
  const toSave: SiteSettings = { ...content, commerce, sample, businessFacts, customIndustries, announcement: { ...content.announcement, configured: true } };
  const { error } = await sb.from('site_settings')
    .upsert({ id: 'default', content: toSave, updated_by: admin.id, updated_at: new Date().toISOString() }, { onConflict: 'id' });
  if (error) return { ok: false, message: error.message };
  for (const l of locales) revalidatePath(`/${l}`, 'layout');
  revalidatePath('/sitemap.xml');   // announcement/footer live in the layout
  return { ok: true };
}
