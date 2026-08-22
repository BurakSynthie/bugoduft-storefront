// §P0-1 Pure, dependency-free derivation of EMAIL verification from a Supabase Auth user.
//
// Supabase Auth timestamps:
//   • email_confirmed_at — the EMAIL address was confirmed (authoritative for email identity)
//   • phone_confirmed_at — the PHONE number was confirmed
//   • confirmed_at       — email OR phone was confirmed; exists for backward compatibility
//
// Email-identity linking (guest orders / sample credit) is an EMAIL-security decision, so it
// must depend ONLY on email_confirmed_at. Using confirmed_at would let a phone-confirmed but
// email-UNconfirmed user be treated as email-verified. This helper is the single source of
// that truth and is unit-tested directly.
export function deriveEmailVerified(
  authUser: { email_confirmed_at?: string | null } | null | undefined,
): boolean {
  return Boolean(authUser?.email_confirmed_at);
}
