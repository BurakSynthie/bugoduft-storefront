// §1 Customer artwork upload hardening. Pure, server-usable validation for artwork upload
// metadata. The browser's accept= filter is advisory only — every signed-URL request and
// every finalize path is validated here on the server before any privileged action.
//
// Not a checkout redesign: this only gates which upload targets may be minted and which
// stored paths finalizeCheckout will accept. It does not touch pricing, leases, benefits,
// draft-order creation, or the webhook state machine.

// Print-artwork formats the configurator supports (vector + raster). MIME is checked when the
// browser provides one, but extension is the reliable signal (AI/EPS/HEIC MIME is inconsistent
// across browsers), so a file is accepted when EITHER its extension OR its MIME is allowed and
// NEITHER indicates a disallowed category.
export const ARTWORK_MAX_BYTES = 50 * 1024 * 1024;          // 50 MB per file (print artwork)
export const ARTWORK_MAX_FILES = 12;                         // bounded per checkout/configuration
export const ARTWORK_MAX_SUPPORTING = 10;                    // supporting-0 .. supporting-9

const ALLOWED_EXT = new Set([
  'pdf', 'svg', 'ai', 'eps', 'png', 'jpg', 'jpeg', 'webp', 'heic', 'heif',
]);
// Explicitly disallowed categories (executables, archives, scripts, office macros, fonts).
const BLOCKED_EXT = new Set([
  'exe', 'msi', 'bat', 'cmd', 'com', 'scr', 'dll', 'so', 'dylib', 'bin', 'app',
  'sh', 'bash', 'zsh', 'ps1', 'js', 'mjs', 'cjs', 'jar', 'py', 'rb', 'php', 'pl',
  'zip', 'rar', '7z', 'tar', 'gz', 'bz2', 'xz', 'tgz', 'iso', 'dmg', 'cab',
  'html', 'htm', 'xml', 'svgz', 'doc', 'docm', 'xlsm', 'pptm', 'ttf', 'otf', 'woff', 'woff2',
]);
const ALLOWED_MIME = new Set([
  'application/pdf', 'image/svg+xml', 'application/postscript', 'application/illustrator',
  'application/eps', 'image/x-eps', 'image/png', 'image/jpeg', 'image/webp',
  'image/heic', 'image/heif', 'image/heic-sequence', 'image/heif-sequence',
  '', 'application/octet-stream',                            // some browsers send empty/generic for AI/EPS/HEIC
]);

export type ArtworkFileField = { field: string; name: string; type?: string | null; size?: number | null };

function ext(name: string): string {
  const m = /\.([A-Za-z0-9]+)$/.exec(name.trim());
  return m ? m[1].toLowerCase() : '';
}

// A field is either exactly "front"/"back" or "supporting-N" with 0 <= N < ARTWORK_MAX_SUPPORTING.
// No slashes, no path traversal, no arbitrary segments.
const FIELD_RE = /^(front|back|supporting-(\d{1,2}))$/;
export function isValidField(field: string): boolean {
  const m = FIELD_RE.exec(field);
  if (!m) return false;
  if (m[2] !== undefined) {
    const n = Number(m[2]);
    return Number.isInteger(n) && n >= 0 && n < ARTWORK_MAX_SUPPORTING;
  }
  return true;
}

export type ArtworkValidation = { ok: true } | { ok: false; reason: string };

// Validate a SINGLE file's metadata (field name, extension/MIME category, size).
export function validateArtworkFile(f: ArtworkFileField): ArtworkValidation {
  if (!f || typeof f.field !== 'string' || typeof f.name !== 'string' || !f.name.trim()) {
    return { ok: false, reason: 'malformed' };
  }
  if (!isValidField(f.field)) return { ok: false, reason: 'bad_field' };
  const e = ext(f.name);
  if (!e) return { ok: false, reason: 'no_extension' };
  if (BLOCKED_EXT.has(e)) return { ok: false, reason: 'blocked_type' };
  const mime = (f.type ?? '').toLowerCase().split(';')[0].trim();
  const extOk = ALLOWED_EXT.has(e);
  const mimeOk = ALLOWED_MIME.has(mime);
  // Accept only when the extension is allowed AND the MIME (if present and meaningful) does
  // not contradict it. A present, non-generic MIME that isn't allowed is rejected even if the
  // extension looks fine (defends against a .png name wrapping a text/html payload, etc.).
  if (!extOk) return { ok: false, reason: 'unsupported_type' };
  if (mime && !mimeOk) return { ok: false, reason: 'mime_mismatch' };
  const size = f.size;
  if (size != null) {
    if (!Number.isFinite(size) || size <= 0) return { ok: false, reason: 'bad_size' };
    if (size > ARTWORK_MAX_BYTES) return { ok: false, reason: 'too_large' };
  }
  return { ok: true };
}

// Validate the WHOLE requested set: count bound, per-file validity, no duplicate fields.
export function validateArtworkFields(files: ArtworkFileField[]): ArtworkValidation {
  if (!Array.isArray(files)) return { ok: false, reason: 'malformed' };
  if (files.length > ARTWORK_MAX_FILES) return { ok: false, reason: 'too_many' };
  const seen = new Set<string>();
  for (const f of files) {
    const v = validateArtworkFile(f);
    if (!v.ok) return v;
    if (seen.has(f.field)) return { ok: false, reason: 'duplicate_field' };
    seen.add(f.field);
  }
  return { ok: true };
}

// §1 finalize path guard: every client-supplied stored path must live under this exact
// configuration's prefix. Prevents attaching an arbitrary path or another config's artwork.
export function configPrefix(configId: string): string {
  return `configurator/${configId}/`;
}
export function isPathUnderConfig(path: string | null | undefined, configId: string): boolean {
  if (!path || typeof path !== 'string') return false;
  if (path.includes('..') || path.includes('\\')) return false;   // no traversal / backslash tricks
  const prefix = configPrefix(configId);
  if (!path.startsWith(prefix)) return false;
  // The segment right after the prefix must be a valid field folder.
  const rest = path.slice(prefix.length);
  const field = rest.split('/')[0];
  return isValidField(field);
}
