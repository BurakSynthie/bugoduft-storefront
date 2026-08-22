import 'server-only';
import { createSupabaseServiceClient } from './server';
import { validateArtworkFields, isValidField, configPrefix, type ArtworkFileField }
  from '@/lib/checkout/artwork-validation';
const BUCKET = process.env.SUPABASE_STORAGE_BUCKET_PRIVATE ?? 'customer-files';

export type UploadTarget = { field: string; path: string; token: string; signedUrl: string };
// §1 carry full metadata so the server can validate type/size/field before minting any URL.
export type UploadFileField = ArtworkFileField;
const safe = (n: string) => n.replace(/[^\w.\-]+/g, '_').slice(-80);

// Server issues signed upload URLs; the browser uploads bytes directly to them.
// Service-role key never leaves the server; anon has no storage write policy.
//
// §1 HARDENING: upload metadata is validated server-side BEFORE any signed URL is created —
// browser accept= is never trusted. Rejects oversized files, unsupported/executable/archive
// types, malformed or arbitrary field names, and excessive file counts. Every generated path
// is forced under configurator/{configId}/{field}/ so a request can never escape the config
// prefix. Returns null when Supabase is unconfigured; throws 'artwork_rejected:<reason>' when
// validation fails (the caller maps that to a safe generic error).
export async function createUploadTargets(
  configId: string, files: UploadFileField[],
): Promise<UploadTarget[] | null> {
  const c = createSupabaseServiceClient();
  if (!c) return null;
  if (!configId || /[^\w.\-]/.test(configId)) throw new Error('artwork_rejected:bad_config');
  const check = validateArtworkFields(files);
  if (!check.ok) throw new Error(`artwork_rejected:${check.reason}`);

  const prefix = configPrefix(configId);
  const out: UploadTarget[] = [];
  for (const f of files) {
    // field is already validated by validateArtworkFields; re-assert before path building.
    if (!isValidField(f.field)) throw new Error('artwork_rejected:bad_field');
    const path = `${prefix}${f.field}/${Date.now()}-${safe(f.name)}`;
    const { data, error } = await c.storage.from(BUCKET).createSignedUploadUrl(path);
    if (error || !data) throw new Error(`storage_signed_url_failed: ${error?.message ?? 'unknown'}`);
    out.push({ field: f.field, path, token: data.token, signedUrl: data.signedUrl });
  }
  return out;
}
export const storageBucket = BUCKET;
