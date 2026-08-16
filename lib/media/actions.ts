'use server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { getAdminUser } from '@/lib/supabase/admin-auth';
import { isSupabaseConfigured } from '@/lib/supabase/env';
import {
  CMS_BUCKET, MEDIA_MAX_BYTES, MEDIA_ALLOWED_MIME, MEDIA_IMAGE_MIME,
  type MediaRecord, type MediaType,
} from './types';

export type MediaResult<T = unknown> =
  | { ok: true; data: T }
  | { ok: false; message: string; blockedBy?: string[] };

const SAFE_EXT: Record<string, string> = {
  'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'video/mp4': 'mp4', 'video/webm': 'webm',
};

function rowToRecord(sb: NonNullable<ReturnType<typeof createSupabaseServerClient>>, r: any): MediaRecord {
  const url = sb.storage.from(CMS_BUCKET).getPublicUrl(r.storage_path).data.publicUrl;
  return {
    id: r.id, storagePath: r.storage_path, url, mediaType: r.media_type as MediaType,
    mimeType: r.mime_type, originalFilename: r.original_filename ?? null, sizeBytes: r.size_bytes ?? null,
    width: r.width ?? null, height: r.height ?? null,
    altDe: r.alt_de ?? null, altEn: r.alt_en ?? null, altFr: r.alt_fr ?? null,
    createdAt: r.created_at,
  };
}

// Writes go through the admin's RLS session — storage + table policies enforce
// is_admin(). The service-role key never touches this path or the browser.
export async function uploadMediaAction(fd: FormData): Promise<MediaResult<MediaRecord>> {
  if (!isSupabaseConfigured()) return { ok: false, message: 'Supabase yapılandırılmadı.' };
  const admin = await getAdminUser();
  if (!admin) return { ok: false, message: 'Yetkisiz.' };
  const sb = createSupabaseServerClient();
  if (!sb) return { ok: false, message: 'Supabase yapılandırılmadı.' };

  const file = fd.get('file');
  if (!(file instanceof File) || file.size === 0) return { ok: false, message: 'Dosya bulunamadı.' };
  const mime = file.type;
  if (!MEDIA_ALLOWED_MIME.includes(mime)) return { ok: false, message: 'Desteklenmeyen dosya türü (JPG, PNG, WebP, MP4, WebM).' };
  if (file.size > MEDIA_MAX_BYTES) return { ok: false, message: 'Dosya çok büyük (maks. 50 MB).' };

  const mediaType: MediaType = MEDIA_IMAGE_MIME.includes(mime) ? 'image' : 'video';
  const ext = SAFE_EXT[mime] ?? 'bin';
  const id = (globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`);
  const storagePath = `${mediaType}/${id}.${ext}`;

  const buf = await file.arrayBuffer();
  const up = await sb.storage.from(CMS_BUCKET).upload(storagePath, buf, { contentType: mime, upsert: false });
  if (up.error) return { ok: false, message: `Yükleme başarısız: ${up.error.message}` };

  const ins = await sb.from('media').insert({
    storage_path: storagePath, media_type: mediaType, mime_type: mime,
    original_filename: file.name.slice(0, 200), size_bytes: file.size,
    is_public: true, uploaded_by: admin.id,
  }).select('*').single();
  if (ins.error) {
    await sb.storage.from(CMS_BUCKET).remove([storagePath]);   // don't orphan the object
    return { ok: false, message: `Kayıt oluşturulamadı: ${ins.error.message}` };
  }
  return { ok: true, data: rowToRecord(sb, ins.data) };
}

export async function listMediaAction(): Promise<MediaResult<MediaRecord[]>> {
  if (!isSupabaseConfigured()) return { ok: true, data: [] };
  const admin = await getAdminUser();
  if (!admin) return { ok: false, message: 'Yetkisiz.' };
  const sb = createSupabaseServerClient();
  if (!sb) return { ok: true, data: [] };
  const { data, error } = await sb.from('media').select('*').order('created_at', { ascending: false });
  if (error) return { ok: false, message: error.message };
  return { ok: true, data: (data ?? []).map(r => rowToRecord(sb, r)) };
}

export async function updateMediaAltAction(id: string, alt: { de?: string; en?: string; fr?: string }): Promise<MediaResult<true>> {
  const admin = await getAdminUser();
  if (!admin) return { ok: false, message: 'Yetkisiz.' };
  const sb = createSupabaseServerClient();
  if (!sb) return { ok: false, message: 'Supabase yapılandırılmadı.' };
  const { error } = await sb.from('media').update({ alt_de: alt.de ?? null, alt_en: alt.en ?? null, alt_fr: alt.fr ?? null }).eq('id', id);
  if (error) return { ok: false, message: error.message };
  return { ok: true, data: true };
}

// Reference safety: block deletion when a product or the homepage doc still uses it.
export async function deleteMediaAction(id: string): Promise<MediaResult<true>> {
  const admin = await getAdminUser();
  if (!admin) return { ok: false, message: 'Yetkisiz.' };
  const sb = createSupabaseServerClient();
  if (!sb) return { ok: false, message: 'Supabase yapılandırılmadı.' };

  const media = await sb.from('media').select('storage_path').eq('id', id).maybeSingle();
  if (media.error || !media.data) return { ok: false, message: 'Medya bulunamadı.' };

  const blockedBy: string[] = [];
  const prodCols = await sb.from('products').select('product_code')
    .or(`cover_media_id.eq.${id},video_media_id.eq.${id},poster_media_id.eq.${id}`);
  (prodCols.data ?? []).forEach((p: any) => blockedBy.push(`Ürün: ${p.product_code}`));
  const pm = await sb.from('product_media').select('product_id').eq('media_id', id).limit(1);
  if ((pm.data ?? []).length) blockedBy.push('Ürün galerisi');

  const url = sb.storage.from(CMS_BUCKET).getPublicUrl(media.data.storage_path).data.publicUrl;
  const home = await sb.from('homepage_content').select('content').eq('id', 'default').maybeSingle();
  if (home.data?.content && JSON.stringify(home.data.content).includes(url)) blockedBy.push('Ana Sayfa içeriği');

  if (blockedBy.length) return { ok: false, message: 'Bu medya kullanımda; önce bağlantısını kaldırın.', blockedBy };

  const rm = await sb.storage.from(CMS_BUCKET).remove([media.data.storage_path]);
  if (rm.error) return { ok: false, message: rm.error.message };
  const del = await sb.from('media').delete().eq('id', id);
  if (del.error) return { ok: false, message: del.error.message };
  return { ok: true, data: true };
}
