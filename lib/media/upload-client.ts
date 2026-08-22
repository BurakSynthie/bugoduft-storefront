'use client';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import { prepareMediaUploadAction, finalizeMediaUploadAction, type MediaResult } from './actions';
import type { MediaRecord } from './types';

// §v1.2.6-final2 Shared direct-to-Supabase upload helper used by BOTH admin surfaces
// (app/admin/(shell)/medya/MediaLibrary.tsx and components/admin/MediaPicker.tsx — the latter is
// reused from Homepage, Blog, Products, SEO OG picker and other editors). The actual File bytes
// go BROWSER -> SUPABASE STORAGE via uploadToSignedUrl(); the Next.js/Vercel Server Actions only
// ever see metadata (prepare) and the issued path (finalize), never the bytes. This removes the
// old Server-Action body-size ceiling that made ~1.5 MB+ images and any video fail, while the
// 50 MB app-level cap stays enforced server-side in prepare + finalize. Mirrors the approved
// checkout upload flow (lib/cart/checkout-client.ts).
export async function uploadMediaFile(file: File): Promise<MediaResult<MediaRecord>> {
  if (!file || file.size === 0) return { ok: false, message: 'Dosya bulunamadı.' };

  // 1) Ask the server (metadata only) for a signed upload ticket on a server-controlled path.
  const prep = await prepareMediaUploadAction({ filename: file.name, mimeType: file.type, sizeBytes: file.size });
  if (!prep.ok) return { ok: false, message: prep.message };

  // 2) Upload the actual bytes straight to Supabase Storage — never through a Server Action.
  const sb = createSupabaseBrowserClient();
  if (!sb) return { ok: false, message: 'Supabase yapılandırılmadı.' };
  const up = await sb.storage.from(prep.data.bucket).uploadToSignedUrl(prep.data.path, prep.data.token, file);
  if (up.error) return { ok: false, message: `Yükleme başarısız: ${up.error.message}` };

  // 3) Finalize: server re-auths, validates the path, and creates the public.media row.
  return finalizeMediaUploadAction({
    path: prep.data.path, mimeType: file.type, originalFilename: file.name, sizeBytes: file.size,
  });
}
