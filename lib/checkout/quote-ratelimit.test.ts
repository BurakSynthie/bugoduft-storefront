// §3 quote rate-limit error-handling tests. PURE — run with: tsx lib/checkout/quote-ratelimit.test.ts
// Proves the limiter fails CLOSED on real errors and only fails open for a genuinely absent
// function (backward compat before 0034/0035 are applied).
import { rateLimitDecision } from '@/lib/checkout/quote-ratelimit';

let failures = 0;
function expect(label: string, got: unknown, want: unknown) {
  const ok = got === want;
  if (!ok) failures++;
  // eslint-disable-next-line no-console
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}: got ${JSON.stringify(got)} want ${JSON.stringify(want)}`);
}

// under the limit → allow
expect('allowed true → allow', rateLimitDecision(true, null), 'allow');
// over the limit → rate_limited
expect('allowed false → rate_limited', rateLimitDecision(false, null), 'rate_limited');
// genuinely missing function (PostgREST) → allow (backward compat)
expect('PGRST202 missing fn → allow', rateLimitDecision(null, { code: 'PGRST202', message: 'not found' }), 'allow');
// genuinely missing function (Postgres undefined_function) → allow
expect('42883 undefined_function → allow', rateLimitDecision(null, { code: '42883', message: 'undefined' }), 'allow');
// permission error → error (fail closed, NOT allow)
expect('42501 insufficient_privilege → error', rateLimitDecision(null, { code: '42501', message: 'denied' }), 'error');
// generic PostgREST/runtime error → error
expect('PGRST301 → error', rateLimitDecision(null, { code: 'PGRST301', message: 'jwt' }), 'error');
// unknown/no-code DB error → error (fail closed)
expect('no-code error → error', rateLimitDecision(null, { message: 'boom' }), 'error');
// an error object always dominates even if allowed somehow present
expect('error dominates stale allowed=true', rateLimitDecision(true, { code: '42501' }), 'error');
// null/undefined allowed with no error → allow (RPC returned nothing but succeeded)
expect('null allowed, no error → allow', rateLimitDecision(null, null), 'allow');

// eslint-disable-next-line no-console
console.log(failures === 0 ? '\nALL QUOTE-RATELIMIT TESTS PASSED' : `\n${failures} QUOTE-RATELIMIT TEST(S) FAILED`);
if (failures > 0) process.exit(1);
