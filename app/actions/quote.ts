'use server';
import crypto from 'node:crypto';
import type { Locale } from '@/i18n/config';
import { createSupabaseServiceClient } from '@/lib/supabase/server';
import { isSupabaseConfigured } from '@/lib/supabase/env';
import { normalizeEmailOrNull } from '@/lib/customer/email';
import { rateLimitDecision } from '@/lib/checkout/quote-ratelimit';

export type QuoteInput = {
  locale: Locale; company: string; email: string; quantity: string; message: string;
  name?: string; phone?: string; productCode?: string; hp?: string;   // hp = honeypot
};
export type QuoteResult = { ok: true } | { ok: false; code: 'unconfigured' | 'invalid' | 'error' | 'rate_limited'; message?: string };

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const RATE_MAX = 5;                 // max submissions per window per email
const RATE_WINDOW_SECONDS = 3600;   // 1 hour fixed window

// §4 QUOTE INSERT SECURITY. Direct anon/authenticated REST INSERT into `quotes` is removed in
// migration 0034 (the `with check (true)` policy is dropped and table INSERT grants revoked).
// The ONLY write path is this server action, which validates + honeypots FIRST, then writes
// with the SERVICE-ROLE client (server-only; the key never reaches the browser). A DB-backed
// atomic fixed-window rate limit throttles abuse, keyed by a PRIVACY-SAFE hash of the
// normalized email + window — no raw IP or raw email is ever stored.
export async function submitQuoteAction(input: QuoteInput): Promise<QuoteResult> {
  if (input.hp) return { ok: true };                             // bot filled honeypot — pretend success
  if (!isSupabaseConfigured()) return { ok: false, code: 'unconfigured' };
  const email = (input.email ?? '').trim();
  if (!EMAIL.test(email)) return { ok: false, code: 'invalid' };
  if (!(input.company ?? '').trim() && !(input.message ?? '').trim()) return { ok: false, code: 'invalid' };

  // Service-role client: RLS-exempt, server-only. Used ONLY after validation + honeypot.
  const svc = createSupabaseServiceClient();
  if (!svc) return { ok: false, code: 'unconfigured' };

  // Privacy-safe rate-limit key: sha256 over the normalized email + fixed window index. We do
  // NOT store the raw email or any IP; only this opaque hash lands in quote_rate_limits.
  const normEmail = normalizeEmailOrNull(email) ?? email.toLowerCase();
  const windowIdx = Math.floor(Date.now() / (RATE_WINDOW_SECONDS * 1000));
  const bucketKey = crypto.createHash('sha256').update(`${normEmail}|${windowIdx}`).digest('hex');
  const { data: allowed, error: rlErr } = await svc.rpc('quote_rate_check',
    { p_key: bucketKey, p_max: RATE_MAX, p_window_seconds: RATE_WINDOW_SECONDS });
  const decision = rateLimitDecision(allowed as boolean | null, rlErr as any);
  if (decision === 'error') {
    // Real permission/runtime/DB error — do NOT silently disable the limiter. Log server-side
    // and return a controlled generic error; never expose DB internals to the customer.
    console.error('[quote] rate-limit check failed:', (rlErr as any)?.code ?? '', (rlErr as any)?.message ?? rlErr);
    return { ok: false, code: 'error' };
  }
  if (decision === 'rate_limited') return { ok: false, code: 'rate_limited' };
  // decision === 'allow' → proceed (either under the limit, or function genuinely absent).

  const qtyDigits = (input.quantity ?? '').replace(/\D/g, '');
  const quantity = qtyDigits ? Math.min(100000000, parseInt(qtyDigits, 10)) : null;

  const { error } = await svc.from('quotes').insert({
    locale: input.locale,
    company: (input.company ?? '').slice(0, 200) || null,
    name: (input.name ?? '').slice(0, 200) || null,
    email: email.slice(0, 200),
    phone: (input.phone ?? '').slice(0, 60) || null,
    product_code: (input.productCode ?? '').slice(0, 60) || null,
    quantity,
    message: (input.message ?? '').slice(0, 4000) || null,
    source: 'storefront',
  });
  if (error) { console.error('[quote] insert failed:', error.message); return { ok: false, code: 'error' }; }
  return { ok: true };
}
