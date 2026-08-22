// §OPTION-3-v4.1 #5 regression for sample attempt-key ROTATION after a terminal (paid/cancelled)
// attempt. Semantics that matter: a pending/unpaid retry RETAINS the same key (resumes the same
// in-flight draft), but a deliberate later purchase after a terminal attempt ROTATES to a fresh key
// so it never resumes the old (paid/cancelled) invoice; the rotated key then persists (survives a
// simulated reload) so the retry itself is idempotent.
// Run: tsx lib/checkout/sample-attempt-rotate.test.ts
import { createRequire } from 'node:module';

class MemStorage {
  private m = new Map<string, string>();
  getItem(k: string) { return this.m.has(k) ? this.m.get(k)! : null; }
  setItem(k: string, v: string) { this.m.set(k, v); }
  removeItem(k: string) { this.m.delete(k); }
}
(globalThis as any).window = {};
(globalThis as any).sessionStorage = new MemStorage();
if (typeof (globalThis as any).crypto === 'undefined' || !('randomUUID' in (globalThis as any).crypto)) {
  (globalThis as any).crypto = { randomUUID: () =>
    'xxxxxxxx-xxxx-4xxx-8xxx-xxxxxxxxxxxx'.replace(/x/g, () => ((Math.random()*16)|0).toString(16)) };
}

const require = createRequire(import.meta.url);
const { getSampleAttemptId, rotateSampleAttemptId } = require('./sample-attempt.ts');

let failures = 0;
const pass = (m: string) => console.log('PASS  ' + m);
const fail = (m: string) => { console.log('FAIL  ' + m); failures++; };
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// pending/unpaid: same identity retains the key (idempotent resume of the same in-flight attempt).
const k1 = getSampleAttemptId('guest');
getSampleAttemptId('guest') === k1 ? pass('pending retry retains SAME key (resumes same draft)') : fail('pending retry rotated unexpectedly');

// terminal (paid/cancelled): rotate → a NEW key, valid uuid, different from the retained one.
const r1 = rotateSampleAttemptId('guest');
(UUID_RE.test(r1) && r1 !== k1) ? pass('terminal → rotateSampleAttemptId mints a NEW key') : fail('rotate did not mint new key: ' + r1);

// the rotated key PERSISTS: a subsequent get (simulated reload) returns the rotated key, not the old one.
const after = getSampleAttemptId('guest');
(after === r1 && after !== k1) ? pass('rotated key persists across reload (retry is idempotent on new key)') : fail('rotated key not persisted: ' + after);

// a second deliberate purchase can rotate again to yet another fresh key.
const r2 = rotateSampleAttemptId('guest');
(UUID_RE.test(r2) && r2 !== r1) ? pass('second deliberate purchase rotates again (new key each time)') : fail('second rotate reused key');

// identity scoping preserved: rotating for one identity does not leak to another.
const other = getSampleAttemptId('user-xyz');
(other !== r2 && UUID_RE.test(other)) ? pass('rotation is identity-scoped (different identity gets its own key)') : fail('rotation leaked across identity');

console.log(failures === 0 ? '\nALL SAMPLE-ATTEMPT-ROTATE TESTS PASSED' : `\n${failures} SAMPLE-ATTEMPT-ROTATE TEST(S) FAILED`);
process.exit(failures ? 1 : 0);
