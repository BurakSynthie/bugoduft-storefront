'use server';
import type { Locale } from '@/i18n/config';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { isSupabaseConfigured } from '@/lib/supabase/env';

export type QuoteInput = {
  locale: Locale; company: string; email: string; quantity: string; message: string;
  name?: string; phone?: string; productCode?: string; hp?: string;   // hp = honeypot
};
export type QuoteResult = { ok: true } | { ok: false; code: 'unconfigured' | 'invalid' | 'error'; message?: string };

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Persists a quote request via the RLS anon client (narrow public INSERT policy).
// Server-side validation + honeypot; no service-role, no secret exposure.
export async function submitQuoteAction(input: QuoteInput): Promise<QuoteResult> {
  if (input.hp) return { ok: true };                             // bot filled honeypot — pretend success
  if (!isSupabaseConfigured()) return { ok: false, code: 'unconfigured' };
  const email = (input.email ?? '').trim();
  if (!EMAIL.test(email)) return { ok: false, code: 'invalid' };
  if (!(input.company ?? '').trim() && !(input.message ?? '').trim()) return { ok: false, code: 'invalid' };

  const sb = createSupabaseServerClient();
  if (!sb) return { ok: false, code: 'unconfigured' };
  const qtyDigits = (input.quantity ?? '').replace(/\D/g, '');
  const quantity = qtyDigits ? Math.min(100000000, parseInt(qtyDigits, 10)) : null;

  const { error } = await sb.from('quotes').insert({
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
  if (error) return { ok: false, code: 'error', message: error.message };
  return { ok: true };
}
