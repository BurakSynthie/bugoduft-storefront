// §OPTION-3-v3 #6C Reload-persistent idempotency key for one logical sample checkout attempt.
//
// The key must survive: a retry, a page reload, a component remount, and a lost response followed
// by reload — so a customer who lost the HTTP response does not generate a NEW key (and thus a
// second payable Draft) on reload. useRef alone does NOT survive reload, so we persist in
// sessionStorage.
//
// SECURITY: the stored record is scoped to an identity tag (the current auth user id, or 'guest').
// A different authenticated identity on the same browser will NOT inherit another user's attempt —
// getSampleAttemptId returns a fresh key when the stored identity tag doesn't match. The key is a
// UUID (validated server-side too). It is cleared on authoritative success or explicit abandonment.
const KEY = 'bugo.sampleCheckoutAttempt.v1';
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Stored = { id: string; identity: string; createdAt: number };

function readStore(): Stored | null {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return null;
    const v = JSON.parse(raw) as Stored;
    if (!v || typeof v.id !== 'string' || !UUID_RE.test(v.id) || typeof v.identity !== 'string') return null;
    return v;
  } catch { return null; }
}

function newId(): string {
  // crypto.randomUUID is available in modern browsers; fall back defensively.
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return '10000000-1000-4000-8000-100000000000'.replace(/[018]/g, (c) =>
    (Number(c) ^ (Math.random() * 16 >> (Number(c) / 4))).toString(16));
}

// Return the stable attempt id for the CURRENT identity, creating+persisting one if absent or if
// the stored record belongs to a different identity (never inherit another user's attempt).
export function getSampleAttemptId(identity: string): string {
  if (typeof window === 'undefined' || typeof sessionStorage === 'undefined') return newId();
  const cur = readStore();
  if (cur && cur.identity === identity) return cur.id;
  const fresh: Stored = { id: newId(), identity, createdAt: Date.now() };
  try { sessionStorage.setItem(KEY, JSON.stringify(fresh)); } catch { /* ignore */ }
  return fresh.id;
}

// Clear the attempt AFTER authoritative success or safe abandonment, so the next purchase gets a
// genuinely new key (a deliberate second sample purchase remains possible).
export function clearSampleAttemptId(): void {
  if (typeof window === 'undefined' || typeof sessionStorage === 'undefined') return;
  try { sessionStorage.removeItem(KEY); } catch { /* ignore */ }
}

// §OPTION-3-v4 #5 ROTATE the attempt key to a genuinely new one for the CURRENT identity, and return
// it. Called when the server reports the prior attempt reached a TERMINAL payment state (paid or
// cancelled): pending/unpaid retries keep the same key (they resume the same in-flight draft), but a
// deliberate LATER purchase must not resume the old (paid/cancelled) invoice — so we mint+persist a
// fresh key here. Unlike clearSampleAttemptId (which just removes and lets the next get mint one),
// this returns the new key so the caller can immediately retry the purchase with it.
export function rotateSampleAttemptId(identity: string): string {
  const fresh: Stored = { id: newId(), identity, createdAt: Date.now() };
  if (typeof window === 'undefined' || typeof sessionStorage === 'undefined') return fresh.id;
  try { sessionStorage.setItem(KEY, JSON.stringify(fresh)); } catch { /* ignore */ }
  return fresh.id;
}
