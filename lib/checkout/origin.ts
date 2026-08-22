// §OPTION-2 DEFECT-4/3 BUGO origin classification from the two order attributes.
// Markers are UUIDs in the schema (configurations.id / sample_orders.id). A non-empty but
// MALFORMED marker must NOT be sent to a UUID DB predicate (that turns a deterministic bad
// payload into repeated DB-error 500 retries). We validate the UUID shape here.
//
// classifyOrigin returns BOTH the authoritative kind AND the NORMALIZED, validated id for the
// winning marker, so the caller branches only on `.kind` and uses only the normalized id in DB /
// business logic — classification and execution can never disagree (e.g. a "   " sample no longer
// reads as truthy in the route).
export type OrderOriginKind = 'main' | 'sample' | 'none' | 'ambiguous' | 'invalid';
export type ClassifiedOrigin =
  | { kind: 'none' }
  | { kind: 'main'; configId: string }
  | { kind: 'sample'; sampleOrderId: string }
  | { kind: 'ambiguous' }
  | { kind: 'invalid' };

// RFC-4122-ish: 8-4-4-4-12 hex. Case-insensitive. (Postgres uuid accepts any hex in that layout;
// BUGO ids are gen_random_uuid v4.)
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function normalizeMarker(v: string | null | undefined): string | null {
  if (typeof v !== 'string') return null;
  const t = v.trim();
  return t.length ? t : null;   // whitespace-only → absent
}

export function isValidUuid(v: string | null | undefined): boolean {
  const n = normalizeMarker(v);
  return n !== null && UUID_RE.test(n);
}

export function classifyOrigin(
  configId: string | null | undefined,
  sampleOrderId: string | null | undefined,
): ClassifiedOrigin {
  const c = normalizeMarker(configId);
  const s = normalizeMarker(sampleOrderId);
  if (c === null && s === null) return { kind: 'none' };
  if (c !== null && s !== null) return { kind: 'ambiguous' };   // both present; never guess
  if (c !== null) return UUID_RE.test(c) ? { kind: 'main', configId: c } : { kind: 'invalid' };
  return UUID_RE.test(s!) ? { kind: 'sample', sampleOrderId: s! } : { kind: 'invalid' };
}
