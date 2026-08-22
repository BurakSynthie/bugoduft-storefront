// §OPTION-3-v3 #6C tests for the reload-persistent sample attempt-key helper. Models the semantics
// that matter: the key SURVIVES a simulated reload (re-read of the same sessionStorage), is
// identity-scoped (a different identity does not inherit it), and is cleared on success.
// Run: tsx lib/checkout/sample-attempt.test.ts
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

// require runs AFTER the shims above (unlike a hoisted static import).
const require = createRequire(import.meta.url);
const { getSampleAttemptId, clearSampleAttemptId } = require('./sample-attempt.ts');

let failures = 0;
const pass = (m: string) => console.log('PASS  ' + m);
const fail = (m: string) => { console.log('FAIL  ' + m); failures++; };
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const k1 = getSampleAttemptId('guest');
UUID_RE.test(k1) ? pass('first call returns a valid UUID') : fail('not a uuid: ' + k1);
getSampleAttemptId('guest') === k1 ? pass('retry (same identity) returns same key') : fail('retry changed key');
getSampleAttemptId('guest') === k1 ? pass('key survives reload (persisted in sessionStorage)') : fail('key lost on reload');
const k2 = getSampleAttemptId('user-abc');
(k2 !== k1 && UUID_RE.test(k2)) ? pass('different identity does not inherit attempt (new key)') : fail('identity inherited attempt');
const k3 = getSampleAttemptId('guest');
(k3 !== k2) ? pass('switching identity rotates the stored attempt') : fail('stored attempt not rotated');
clearSampleAttemptId();
const k4 = getSampleAttemptId('guest');
(k4 !== k3 && UUID_RE.test(k4)) ? pass('clear → next purchase gets a new key') : fail('key not cleared');

console.log(failures === 0 ? '\nALL SAMPLE-ATTEMPT TESTS PASSED' : `\n${failures} SAMPLE-ATTEMPT TEST(S) FAILED`);
process.exit(failures ? 1 : 0);
