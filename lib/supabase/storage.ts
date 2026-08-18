import 'server-only';
import { createSupabaseServiceClient } from './server';
const BUCKET = process.env.SUPABASE_STORAGE_BUCKET_PRIVATE ?? 'customer-files';

export type UploadTarget = { field: string; path: string; token: string; signedUrl: string };
const safe = (n: string) => n.replace(/[^\w.\-]+/g, '_').slice(-80);

// Server issues signed upload URLs; the browser uploads bytes directly to them.
// Service-role key never leaves the server; anon has no storage write policy.
export async function createUploadTargets(
  configId: string, files: { field: string; name: string }[],
): Promise<UploadTarget[] | null> {
  const c = createSupabaseServiceClient();
  if (!c) return null;
  const out: UploadTarget[] = [];
  for (const f of files) {
    const path = `configurator/${configId}/${f.field}/${Date.now()}-${safe(f.name)}`;
    const { data, error } = await c.storage.from(BUCKET).createSignedUploadUrl(path);
    if (error || !data) throw new Error(`storage_signed_url_failed: ${error?.message ?? 'unknown'}`);
    out.push({ field: f.field, path, token: data.token, signedUrl: data.signedUrl });
  }
  return out;
}
export const storageBucket = BUCKET;
