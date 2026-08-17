import 'server-only';
import { revalidatePath } from 'next/cache';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { getAdminUser } from '@/lib/supabase/admin-auth';
import { isSupabaseConfigured } from '@/lib/supabase/env';
import { locales, type Locale } from '@/i18n/config';
import { emptyCollTr, type CollectionTr, type EditableCollection, type CollectionResult } from '@/lib/collections/model';

export async function loadCollections(): Promise<EditableCollection[]> {
  if (!isSupabaseConfigured()) return [];
  const sb = createSupabaseServerClient();
  if (!sb) return [];
  const { data } = await sb.from('collections')
    .select('id, code, group_id, is_active, sort_order, collection_translations(locale,name,slug,description,seo_title,seo_description)')
    .order('sort_order', { ascending: true });
  return (data ?? []).map((c: any) => {
    const tr = emptyCollTr();
    for (const l of locales) {
      const row = (c.collection_translations ?? []).find((t: any) => t.locale === l);
      if (row) tr[l] = { name:row.name ?? '', slug:row.slug ?? '', description:row.description ?? '',
        seoTitle:row.seo_title ?? '', seoDescription:row.seo_description ?? '' };
    }
    return { id:c.id, code:c.code, groupId:c.group_id, isActive:c.is_active, sortOrder:c.sort_order ?? 0, tr };
  });
}

function revalidateStore() { for (const l of locales) { revalidatePath(`/${l}`); revalidatePath(`/${l}/produkte`); } }

export async function saveCollection(input: EditableCollection): Promise<CollectionResult> {
  const admin = await getAdminUser();
  if (!admin) return { ok:false, message:'Yetkisiz.' };
  const sb = createSupabaseServerClient();
  if (!sb) return { ok:false, message:'Supabase yapılandırılmadı.' };
  for (const l of locales) {
    if (!input.tr[l].name.trim() || !input.tr[l].slug.trim()) return { ok:false, message:`Ad ve slug zorunlu (${l.toUpperCase()}).` };
  }
  const up = await sb.from('collections').update({ is_active: input.isActive, sort_order: input.sortOrder }).eq('id', input.id);
  if (up.error) return { ok:false, message:up.error.message };
  const rows = locales.map(l => ({ collection_id: input.id, locale: l,
    name: input.tr[l].name, slug: input.tr[l].slug, description: input.tr[l].description || null,
    seo_title: input.tr[l].seoTitle || null, seo_description: input.tr[l].seoDescription || null }));
  const trUp = await sb.from('collection_translations').upsert(rows, { onConflict: 'collection_id,locale' });
  if (trUp.error) return { ok:false, message:trUp.error.message };
  revalidateStore();
  return { ok:true, data:true };
}

export async function reorderCollection(id: string, dir: -1 | 1): Promise<CollectionResult> {
  const admin = await getAdminUser();
  if (!admin) return { ok:false, message:'Yetkisiz.' };
  const sb = createSupabaseServerClient();
  if (!sb) return { ok:false, message:'Supabase yapılandırılmadı.' };
  const { data } = await sb.from('collections').select('id,sort_order').order('sort_order');
  const list = data ?? [];
  const i = list.findIndex((c: any) => c.id === id); const j = i + dir;
  if (i < 0 || j < 0 || j >= list.length) return { ok:true, data:true };
  await sb.from('collections').update({ sort_order: list[j].sort_order }).eq('id', list[i].id);
  await sb.from('collections').update({ sort_order: list[i].sort_order }).eq('id', list[j].id);
  revalidateStore();
  return { ok:true, data:true };
}

// Collections map 1:1 to product tiers; deletion is blocked whenever a product
// references the collection (which is the normal case) so products/orders never break.
export async function deleteCollection(id: string): Promise<CollectionResult> {
  const admin = await getAdminUser();
  if (!admin) return { ok:false, message:'Yetkisiz.' };
  const sb = createSupabaseServerClient();
  if (!sb) return { ok:false, message:'Supabase yapılandırılmadı.' };
  const prod = await sb.from('products').select('id').eq('collection_id', id).limit(1);
  if ((prod.data ?? []).length) return { ok:false, message:'Bu koleksiyon bir ürüne bağlı; silinemez.', blockedBy:['Ürün'] };
  await sb.from('collection_translations').delete().eq('collection_id', id);
  const del = await sb.from('collections').delete().eq('id', id);
  if (del.error) return { ok:false, message:del.error.message };
  revalidateStore();
  return { ok:true, data:true };
}
