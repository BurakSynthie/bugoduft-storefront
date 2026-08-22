'use server';
import { createSupabaseServerClient, createSupabaseServiceClient } from '@/lib/supabase/server';
import { getAdminUser } from '@/lib/supabase/admin-auth';
import { isSupabaseConfigured } from '@/lib/supabase/env';
import {
  CMS_BUCKET, MEDIA_MAX_BYTES, MEDIA_ALLOWED_MIME, MEDIA_IMAGE_MIME,
  type MediaRecord, type MediaType,
} from './types';

export type MediaResult<T = unknown> =
  | { ok: true; data: T }
  | { ok: false; message: string; blockedBy?: string[] };

// §v1.2.6-final2 Direct-to-Supabase signed upload contract. The browser calls
// prepareMediaUploadAction with METADATA ONLY (never bytes), uploads the File directly to the
// signed URL, then calls finalizeMediaUploadAction with the issued path (again, no bytes). See
// lib/media/upload-client.ts for the shared client helper both admin surfaces use. This mirrors
// the approved lib/supabase/storage.ts + lib/cart/checkout-client.ts pattern.
export type MediaUploadMeta = { filename: string; mimeType: string; sizeBytes: number };
export type MediaUploadTicket = { path: string; token: string; bucket: string };
export type MediaFinalizeInput = { path: string; mimeType: string; originalFilename: string; sizeBytes: number };

const SAFE_EXT: Record<string, string> = {
  'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'video/mp4': 'mp4', 'video/webm': 'webm',
};
// Server-controlled cms-media path shape: <mediaType>/<id>.<ext>. finalize validates the
// browser-supplied path against this so an arbitrary/escaping storage path is never persisted.
const MEDIA_PATH_RE = /^(image|video)\/[A-Za-z0-9][A-Za-z0-9._-]*\.(jpg|png|webp|mp4|webm)$/;

function mediaTypeOf(mime: string): MediaType {
  return MEDIA_IMAGE_MIME.includes(mime) ? 'image' : 'video';
}

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

// A) PREPARE — small authenticated action that receives METADATA ONLY (no file bytes) and
// returns a short-lived signed upload URL/token for a server-controlled cms-media path. The
// service-role key is used only to MINT the signed URL and never leaves the server; the browser
// receives only { path, token, bucket }. browser-declared MIME is NOT trusted — validated here.
export async function prepareMediaUploadAction(meta: MediaUploadMeta): Promise<MediaResult<MediaUploadTicket>> {
  if (!isSupabaseConfigured()) return { ok: false, message: 'Supabase yapılandırılmadı.' };
  const admin = await getAdminUser();
  if (!admin) return { ok: false, message: 'Yetkisiz.' };

  const mime = String(meta?.mimeType ?? '');
  const size = Number(meta?.sizeBytes);
  if (!Number.isFinite(size) || size <= 0) return { ok: false, message: 'Dosya bulunamadı.' };
  if (!MEDIA_ALLOWED_MIME.includes(mime)) return { ok: false, message: 'Desteklenmeyen dosya türü (JPG, PNG, WebP, MP4, WebM).' };
  if (size > MEDIA_MAX_BYTES) return { ok: false, message: 'Dosya çok büyük (maks. 50 MB).' };

  // Server owns the storage path: <image|video>/<uuid>.<ext>. The browser can never choose it.
  const mediaType = mediaTypeOf(mime);
  const ext = SAFE_EXT[mime] ?? 'bin';
  const id = (globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`);
  const storagePath = `${mediaType}/${id}.${ext}`;

  // Service-role client mints the signed upload URL (anon has no cms-media write policy). This
  // key is SERVER-ONLY and never serialized to the browser.
  const svc = createSupabaseServiceClient();
  if (!svc) return { ok: false, message: 'Supabase yapılandırılmadı.' };
  const { data, error } = await svc.storage.from(CMS_BUCKET).createSignedUploadUrl(storagePath);
  if (error || !data) return { ok: false, message: `Yükleme hazırlanamadı: ${error?.message ?? 'bilinmeyen hata'}` };
  return { ok: true, data: { path: storagePath, token: data.token, bucket: CMS_BUCKET } };
}

// C) FINALIZE — re-authenticates the admin, validates the issued cms-media path + metadata,
// then creates the existing public.media row (preserving uploaded_by / mime_type /
// original_filename / size_bytes / media_type / is_public). NO file bytes pass through here.
// If the row cannot be created after a successful Storage upload, the orphaned object is removed
// best-effort so Storage and the DB stay consistent.
export async function finalizeMediaUploadAction(input: MediaFinalizeInput): Promise<MediaResult<MediaRecord>> {
  if (!isSupabaseConfigured()) return { ok: false, message: 'Supabase yapılandırılmadı.' };
  const admin = await getAdminUser();
  if (!admin) return { ok: false, message: 'Yetkisiz.' };

  const mime = String(input?.mimeType ?? '');
  const size = Number(input?.sizeBytes);
  const path = String(input?.path ?? '');
  if (!MEDIA_ALLOWED_MIME.includes(mime)) return { ok: false, message: 'Desteklenmeyen dosya türü (JPG, PNG, WebP, MP4, WebM).' };
  if (!Number.isFinite(size) || size <= 0) return { ok: false, message: 'Dosya bulunamadı.' };
  if (size > MEDIA_MAX_BYTES) return { ok: false, message: 'Dosya çok büyük (maks. 50 MB).' };

  // Validate the path was issued in the expected server-controlled cms-media shape AND that its
  // type/extension are consistent with the (server-validated) MIME — reject anything else so an
  // arbitrary/escaping path can never be persisted or referenced.
  const mediaType = mediaTypeOf(mime);
  const ext = SAFE_EXT[mime];
  if (!MEDIA_PATH_RE.test(path) || !path.startsWith(`${mediaType}/`) || !ext || !path.endsWith(`.${ext}`)) {
    return { ok: false, message: 'Geçersiz yükleme yolu.' };
  }

  // Insert through the admin RLS session so the existing media table policies (is_admin) apply
  // and uploaded_by is the acting admin — identical row shape to the previous flow.
  const sb = createSupabaseServerClient();
  if (!sb) return { ok: false, message: 'Supabase yapılandırılmadı.' };
  const ins = await sb.from('media').insert({
    storage_path: path, media_type: mediaType, mime_type: mime,
    original_filename: String(input?.originalFilename ?? '').slice(0, 200) || null, size_bytes: size,
    is_public: true, uploaded_by: admin.id,
  }).select('*').single();
  if (ins.error) {
    // Best-effort: don't orphan the just-uploaded Storage object when the DB row fails.
    const svc = createSupabaseServiceClient();
    if (svc) { try { await svc.storage.from(CMS_BUCKET).remove([path]); } catch { /* best-effort */ } }
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

  // Phase 6E-B2 completion §14: also guard the global settings doc — covers the
  // default OG image and any other future settings-managed media reference, using
  // the same "does the JSON blob mention this URL" check as homepage_content above.
  const settingsRow = await sb.from('site_settings').select('content').eq('id', 'default').maybeSingle();
  if (settingsRow.data?.content && JSON.stringify(settingsRow.data.content).includes(url)) blockedBy.push('Site ayarları (ör. varsayılan OG görseli)');

  if (blockedBy.length) return { ok: false, message: 'Bu medya kullanımda; önce bağlantısını kaldırın.', blockedBy };

  const rm = await sb.storage.from(CMS_BUCKET).remove([media.data.storage_path]);
  if (rm.error) return { ok: false, message: rm.error.message };
  const del = await sb.from('media').delete().eq('id', id);
  if (del.error) return { ok: false, message: del.error.message };
  return { ok: true, data: true };
}
