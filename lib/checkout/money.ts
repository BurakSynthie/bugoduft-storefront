// §OPTION-2 Deterministic Shopify money → integer cents. Payment-critical: NO float equality,
// reject malformed/ambiguous input rather than silently coercing.
//
// Shopify sends money as decimal strings, e.g. "269.00", "23900.00". We require an optional
// leading sign is NOT allowed (order totals are non-negative), an integer part, and 0–2
// decimal places. Anything else (letters, multiple dots, >2 decimals, empty) → null (reject).
export function parseMoneyToCents(input: unknown): number | null {
  if (typeof input !== 'string' && typeof input !== 'number') return null;
  const s = String(input).trim();
  // strict: digits, optional single '.', 1-2 fractional digits. No sign, no thousands separators.
  if (!/^\d+(\.\d{1,2})?$/.test(s)) return null;
  const [w, f = ''] = s.split('.');
  const cents = Number(w) * 100 + Number((f + '00').slice(0, 2));
  return Number.isSafeInteger(cents) ? cents : null;
}

// Normalize an ISO-4217-ish currency code for comparison: trim + uppercase. Empty → null.
export function normalizeCurrency(input: unknown): string | null {
  if (typeof input !== 'string') return null;
  const c = input.trim().toUpperCase();
  return /^[A-Z]{3}$/.test(c) ? c : null;
}

// Compare an actual Shopify order amount+currency against BUGO's authoritative expected value.
// Returns a structured verdict so the caller can branch (accept / mismatch / unparseable).
export type MoneyVerdict =
  | { ok: true; actualCents: number; actualCurrency: string }
  | { ok: false; reason: 'unparseable_amount' | 'amount_mismatch' | 'currency_mismatch';
      actualCents: number | null; actualCurrency: string | null };

export function verifyMoney(
  expectedCents: number, expectedCurrency: string,
  actualAmount: unknown, actualCurrency: unknown,
): MoneyVerdict {
  const actualCents = parseMoneyToCents(actualAmount);
  const actualCur = normalizeCurrency(actualCurrency);
  const expCur = normalizeCurrency(expectedCurrency);
  if (actualCents === null) return { ok: false, reason: 'unparseable_amount', actualCents: null, actualCurrency: actualCur };
  if (actualCur === null || expCur === null || actualCur !== expCur)
    return { ok: false, reason: 'currency_mismatch', actualCents, actualCurrency: actualCur };
  if (actualCents !== expectedCents)
    return { ok: false, reason: 'amount_mismatch', actualCents, actualCurrency: actualCur };
  return { ok: true, actualCents, actualCurrency: actualCur };
}
