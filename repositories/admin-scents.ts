import { revalidatePath } from 'next/cache';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { getAdminUser } from '@/lib/supabase/admin-auth';
import { isSupabaseConfigured } from '@/lib/supabase/env';
import { locales, type Locale } from '@/i18n/config';
import { SCENT_CATEGORIES, emptyScentTr, type ScentTr, type EditableScent, type ScentResult } from '@/lib/scents/model';

export async function loadScents(): Promise<EditableScent[]> {
  if (!isSupabaseConfigured()) return [];
  const sb = createSupabaseServerClient();
  if (!sb) return [];
  const { data } = await sb.from('scents')
    .select('id, code, category, is_active, featured, sort_order, scent_translations(locale,name,description)')
    .order('sort_order', { ascending: true }).order('code', { ascending: true });
  return (data ?? []).map((s: any) => {
    const tr = emptyScentTr();
    for (const l of locales) {
      const row = (s.scent_translations ?? []).find((t: any) => t.locale === l);
      if (row) tr[l] = { name: row.name ?? '', description: row.description ?? '' };
    }
    return { id:s.id, code:s.code, category:s.category, isActive:s.is_active, featured:s.featured ?? false,
      sortOrder:s.sort_order ?? 0, tr };
  });
}

function revalidateStore() { for (const l of locales) { revalidatePath(`/${l}`); revalidatePath(`/${l}/konfigurator`); } }

export async function saveScent(input: EditableScent): Promise<ScentResult> {
  const admin = await getAdminUser();
  if (!admin) return { ok:false, message:'Yetkisiz.' };
  const sb = createSupabaseServerClient();
  if (!sb) return { ok:false, message:'Supabase yapılandırılmadı.' };
  if (!input.code.trim()) return { ok:false, message:'Kod zorunlu.' };
  if (!(SCENT_CATEGORIES as readonly string[]).includes(input.category)) return { ok:false, message:'Kategori geçersiz.' };
  for (const l of locales) if (!input.tr[l].name.trim()) return { ok:false, message:`İsim zorunlu (${l.toUpperCase()}).` };

  let scentId = input.id;
  if (scentId) {
    const up = await sb.from('scents').update({ code:input.code.trim(), category:input.category,
      is_active:input.isActive, featured:input.featured, sort_order:input.sortOrder, updated_at:new Date().toISOString() })
      .eq('id', scentId);
    if (up.error) return { ok:false, message:up.error.message };
  } else {
    const ins = await sb.from('scents').insert({ code:input.code.trim(), category:input.category,
      is_active:input.isActive, featured:input.featured, sort_order:input.sortOrder }).select('id').single();
    if (ins.error) return { ok:false, message:ins.error.message };
    scentId = ins.data.id;
  }
  const trRows = locales.map(l => ({ scent_id: scentId, locale: l, name: input.tr[l].name, description: input.tr[l].description || null }));
  const trUp = await sb.from('scent_translations').upsert(trRows, { onConflict: 'scent_id,locale' });
  if (trUp.error) return { ok:false, message:trUp.error.message };
  revalidateStore();
  return { ok:true, data:true };
}

export async function reorderScent(id: string, dir: -1 | 1): Promise<ScentResult> {
  const admin = await getAdminUser();
  if (!admin) return { ok:false, message:'Yetkisiz.' };
  const sb = createSupabaseServerClient();
  if (!sb) return { ok:false, message:'Supabase yapılandırılmadı.' };
  const { data } = await sb.from('scents').select('id,sort_order').order('sort_order').order('code');
  const list = data ?? [];
  const i = list.findIndex((s: any) => s.id === id);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= list.length) return { ok:true, data:true };
  const a = list[i], b = list[j];
  await sb.from('scents').update({ sort_order: b.sort_order }).eq('id', a.id);
  await sb.from('scents').update({ sort_order: a.sort_order }).eq('id', b.id);
  revalidateStore();
  return { ok:true, data:true };
}

// Reference-safe delete: block when used by a product, a saved configuration or order (scent 1 or 2).
export async function deleteScent(id: string, code: string): Promise<ScentResult> {
  const admin = await getAdminUser();
  if (!admin) return { ok:false, message:'Yetkisiz.' };
  const sb = createSupabaseServerClient();
  if (!sb) return { ok:false, message:'Supabase yapılandırılmadı.' };
  const blockedBy: string[] = [];
  const ps = await sb.from('product_scents').select('product_id').eq('scent_id', id).limit(1);
  if ((ps.data ?? []).length) blockedBy.push('Ürün ilişkisi');
  const cfg = await sb.from('configurations').select('id').or(`scent_code.eq.${code},scent_code_2.eq.${code}`).limit(1);
  if ((cfg.data ?? []).length) blockedBy.push('Konfigürasyon/sipariş');
  if (blockedBy.length) return { ok:false, message:'Bu koku kullanımda; silinemez.', blockedBy };
  await sb.from('scent_translations').delete().eq('scent_id', id);
  const del = await sb.from('scents').delete().eq('id', id);
  if (del.error) return { ok:false, message:del.error.message };
  revalidateStore();
  return { ok:true, data:true };
}
