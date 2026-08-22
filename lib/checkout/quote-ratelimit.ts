// §3 Pure decision for how to treat the quote rate-limit RPC result. Extracted from the
// server action so it can be unit-tested and so the 'use server' module only exports async
// actions (Next.js requires that). No side effects, no DB, no secrets.
//  - 'allow'         : under the limit (or genuinely missing function on an un-migrated DB)
//  - 'rate_limited'  : over the limit
//  - 'error'         : a real permission/runtime/DB error → fail-closed, controlled generic error
// A genuinely ABSENT function (PostgREST PGRST202 / Postgres 42883 undefined_function) is the
// ONLY error that fails open, purely for backward compatibility before 0034/0035 are applied.
export function rateLimitDecision(
  allowed: boolean | null | undefined,
  err: { code?: string | null; message?: string } | null | undefined,
): 'allow' | 'rate_limited' | 'error' {
  if (err) {
    const code = err.code ?? '';
    const missingFn = code === 'PGRST202' || code === '42883';
    return missingFn ? 'allow' : 'error';
  }
  return allowed === false ? 'rate_limited' : 'allow';
}
