// §SMALL Single source of truth for customer email normalization used in identity linking.
// Pure & dependency-free so every write/lookup/link path uses the SAME canonical form.
//
// Rule: trim + lowercase. Identity lookups MUST use EXACT equality against this normalized value
// (`.eq('email', normalizeEmail(x))`) — never ILIKE/LIKE, whose `%`/`_` are legal characters in an
// email local part and would act as wildcards, risking linking a purchase to the WRONG account.
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

// Nullable convenience for optional inputs (guest flows). Empty/whitespace-only → null.
export function normalizeEmailOrNull(email: string | null | undefined): string | null {
  if (!email) return null;
  const n = normalizeEmail(email);
  return n.length ? n : null;
}
