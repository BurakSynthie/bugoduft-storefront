import { revalidatePath } from 'next/cache';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { getAdminUser } from '@/lib/supabase/admin-auth';
import { isSupabaseConfigured } from '@/lib/supabase/env';
import { locales, type Locale } from '@/i18n/config';
import { SCENT_CATEGORIES, CATALOG_GROUPS, MAIN_COLLECTIONS, emptyScentTr, type ScentTr, type EditableScent, type ScentResult } from '@/lib/scents/model';

// Map the four main products <-> their collection codes, so availability can be edited by
// collection while stored authoritatively in product_scents by product_id.
async function mainProductMap(sb: any): Promise<{ codeToId: Record<string,string>; idToCode: Record<string,string> }> {
  const { data } = await sb.from('products').select('id, is_active, collections!inner(code)').eq('is_active', true);
  const codeToId: Record<string,string> = {}; const idToCode: Record<string,string> = {};
  for (const p of (data ?? []) as any[]) {
    const code = p.collections?.code;
    if (code && (MAIN_COLLECTIONS as readonly string[]).includes(code)) { codeToId[code] = p.id; idToCode[p.id] = code; }
  }
  return { codeToId, idToCode };
}

export async function loadScents(): Promise<EditableScent[]> {
  if (!isSupabaseConfigured()) return [];
  const sb = createSupabaseServerClient();
  if (!sb) return [];
  const { data } = await sb.from('scents')
    .select('id, code, category, catalog_group, is_active, featured, sort_order, scent_translations(locale,name,description)')
    .order('sort_order', { ascending: true }).order('code', { ascending: true });

  // Availability from product_scents, projected onto the four main collection codes.
  const { idToCode } = await mainProductMap(sb);
  const { data: ps } = await sb.from('product_scents').select('product_id, scent_id');
  const availByScent: Record<string, string[]> = {};
  for (const r of (ps ?? []) as any[]) {
    const code = idToCode[r.product_id];
    if (code) (availByScent[r.scent_id] ??= []).push(code);
  }

  return (data ?? []).map((s: any) => {
    const tr = emptyScentTr();
    for (const l of locales) {
      const row = (s.scent_translations ?? []).find((t: any) => t.locale === l);
      if (row) tr[l] = { name: row.name ?? '', description: row.description ?? '' };
    }
    return { id:s.id, code:s.code, category:s.category, catalogGroup:(s.catalog_group ?? null), isActive:s.is_active, featured:s.featured ?? false,
      sortOrder:s.sort_order ?? 0, availability: availByScent[s.id] ?? [], tr };
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
  if (input.catalogGroup !== null && !(CATALOG_GROUPS as readonly string[]).includes(input.catalogGroup)) return { ok:false, message:'Katalog grubu geçersiz.' };
  for (const l of locales) if (!input.tr[l].name.trim()) return { ok:false, message:`İsim zorunlu (${l.toUpperCase()}).` };

  let scentId = input.id;
  if (scentId) {
    const up = await sb.from('scents').update({ code:input.code.trim(), category:input.category, catalog_group:input.catalogGroup,
      is_active:input.isActive, featured:input.featured, sort_order:input.sortOrder, updated_at:new Date().toISOString() })
      .eq('id', scentId);
    if (up.error) return { ok:false, message:up.error.message };
  } else {
    const ins = await sb.from('scents').insert({ code:input.code.trim(), category:input.category, catalog_group:input.catalogGroup,
      is_active:input.isActive, featured:input.featured, sort_order:input.sortOrder }).select('id').single();
    if (ins.error) return { ok:false, message:ins.error.message };
    scentId = ins.data.id;
  }
  const trRows = locales.map(l => ({ scent_id: scentId, locale: l, name: input.tr[l].name, description: input.tr[l].description || null }));
  const trUp = await sb.from('scent_translations').upsert(trRows, { onConflict: 'scent_id,locale' });
  if (trUp.error) return { ok:false, message:trUp.error.message };

  // §P1 AVAILABILITY: authoritative product_scents for the four main products only. Replace
  // the scent's associations to exactly the checked collections. Never touches associations
  // for any non-main product. checkout validation reads these same rows.
  if (Array.isArray(input.availability)) {
    const { codeToId } = await mainProductMap(sb);
    const mainIds = Object.values(codeToId);
    if (mainIds.length) {
      const del = await sb.from('product_scents').delete().eq('scent_id', scentId).in('product_id', mainIds);
      if (del.error) return { ok:false, message:del.error.message };
      const desiredIds = input.availability.map(code => codeToId[code]).filter(Boolean);
      if (desiredIds.length) {
        const insA = await sb.from('product_scents').insert(desiredIds.map(pid => ({ product_id: pid, scent_id: scentId })));
        if (insA.error) return { ok:false, message:insA.error.message };
      }
    }
  }
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
