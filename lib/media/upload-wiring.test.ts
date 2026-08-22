// §v1.2.6-final2 — regression tests for the direct-to-Supabase signed media upload.
// PURE: never imported by production. Static source scans (readFileSync) assert the
// architectural invariants the fix depends on: file bytes go browser → Supabase Storage, the
// Server Actions only ever see metadata/path, the 50 MB cap stays enforced server-side, the
// service-role key never reaches the browser, and both admin surfaces use the shared helper.
//
// Run with:  tsx lib/media/upload-wiring.test.ts
import { readFileSync } from 'node:fs';

let failures = 0;
function assert(label: string, cond: boolean) {
  if (!cond) failures++;
  // eslint-disable-next-line no-console
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${label}`);
}
const read = (p: string) => readFileSync(p, 'utf8');

const actions = read('lib/media/actions.ts');
const client = read('lib/media/upload-client.ts');
const library = read('app/admin/(shell)/medya/MediaLibrary.tsx');
const picker = read('components/admin/MediaPicker.tsx');

// ---- A) The two-step signed-upload contract exists and the byte-through-server path is gone.
assert('actions export prepareMediaUploadAction', /export async function prepareMediaUploadAction/.test(actions));
assert('actions export finalizeMediaUploadAction', /export async function finalizeMediaUploadAction/.test(actions));
assert('old uploadMediaAction (FormData/File through server action) is removed', !/uploadMediaAction/.test(actions));

// ---- B) Server Actions receive METADATA / PATH ONLY — never file bytes.
assert('prepare takes metadata (MediaUploadMeta), not a File/FormData',
  /prepareMediaUploadAction\(meta: MediaUploadMeta\)/.test(actions));
assert('finalize takes a path input (MediaFinalizeInput), not a File/FormData',
  /finalizeMediaUploadAction\(input: MediaFinalizeInput\)/.test(actions));
assert('no Server Action reads file bytes (no File.arrayBuffer / FormData / instanceof File)',
  !/arrayBuffer\(\)/.test(actions) && !/FormData/.test(actions) && !/instanceof File/.test(actions));

// ---- C) Browser uploads the actual bytes directly to Supabase Storage.
assert('client uses createSupabaseBrowserClient()', /createSupabaseBrowserClient\(\)/.test(client));
assert('client uploads bytes with uploadToSignedUrl(path, token, file)',
  /uploadToSignedUrl\(\s*prep\.data\.path,\s*prep\.data\.token,\s*file\s*\)/.test(client));
assert('client calls prepare then finalize (metadata → upload → finalize)',
  /prepareMediaUploadAction\(/.test(client) && /finalizeMediaUploadAction\(/.test(client));

// ---- D) 50 MB app validation remains, enforced server-side in BOTH actions (browser-independent).
assert('MEDIA_MAX_BYTES is still 50 MB', /MEDIA_MAX_BYTES = 50 \* 1024 \* 1024/.test(read('lib/media/types.ts')));
// Slice by the function DECLARATIONS (not bare names, which also appear in the header comment).
const prepBody = actions.slice(
  actions.indexOf('export async function prepareMediaUploadAction'),
  actions.indexOf('export async function finalizeMediaUploadAction'));
const finBody = actions.slice(actions.indexOf('export async function finalizeMediaUploadAction'));
assert('prepare rejects > MEDIA_MAX_BYTES', /> MEDIA_MAX_BYTES/.test(prepBody));
assert('finalize also re-checks > MEDIA_MAX_BYTES', /> MEDIA_MAX_BYTES/.test(finBody));
assert('prepare validates allowed MIME (browser accept not trusted)', /MEDIA_ALLOWED_MIME\.includes/.test(prepBody));
assert('finalize validates allowed MIME', /MEDIA_ALLOWED_MIME\.includes/.test(finBody));

// ---- E) SECURITY: service-role key is server-only; server controls the storage path.
assert('prepare mints the signed URL with the service-role client', /createSupabaseServiceClient\(\)/.test(prepBody) && /createSignedUploadUrl\(/.test(prepBody));
assert('client NEVER imports/uses the service-role client', !/createSupabaseServiceClient/.test(client) && !/serviceRole/i.test(client));
assert('server controls the path (image|video)/<id>.<ext>, not the browser', /const storagePath = `\$\{mediaType\}\/\$\{id\}\.\$\{ext\}`/.test(prepBody));
assert('finalize validates the issued cms-media path against a strict shape', /MEDIA_PATH_RE\.test\(path\)/.test(finBody));
assert('finalize rejects a path whose type/ext does not match the MIME',
  /path\.startsWith\(`\$\{mediaType\}\/`\)/.test(finBody) && /path\.endsWith\(`\.\$\{ext\}`\)/.test(finBody));

// ---- F) finalize does not orphan Storage on DB failure; no row created before a real upload.
assert('finalize removes the orphaned object when the DB row fails', /storage\.from\(CMS_BUCKET\)\.remove\(\[path\]\)/.test(finBody));
assert('the media row is inserted only in finalize (after upload), not in prepare',
  /\.from\('media'\)\.insert\(/.test(finBody) && !/\.from\('media'\)\.insert\(/.test(prepBody));

// ---- G) BOTH admin surfaces use the shared direct-upload helper (Homepage/Blog/Products/SEO
//         OG all reuse MediaPicker, so this covers uploads from every editor, no /admin/medya trip).
assert('MediaLibrary imports uploadMediaFile from upload-client', /uploadMediaFile.*from '@\/lib\/media\/upload-client'/.test(library));
assert('MediaLibrary no longer calls uploadMediaAction', !/uploadMediaAction/.test(library));
assert('MediaPicker imports uploadMediaFile from upload-client', /uploadMediaFile.*from '@\/lib\/media\/upload-client'/.test(picker));
assert('MediaPicker no longer calls uploadMediaAction', !/uploadMediaAction/.test(picker));
assert('MediaPicker still allows uploading (reused by Homepage/Blog/Products/SEO OG)', /uploadMediaFile\(/.test(picker));

// eslint-disable-next-line no-console
console.log(failures === 0 ? '\nALL MEDIA UPLOAD WIRING TESTS PASSED' : `\n${failures} MEDIA UPLOAD WIRING TEST(S) FAILED`);
if (failures > 0) process.exit(1);
