// §P0-1 — executable regression tests for EMAIL-specific verification derivation.
// PURE — tests the EXACT helper used by getCustomerUser to gate email-identity linking.
// Run with:  tsx lib/customer/verified.test.ts
import { deriveEmailVerified } from './verified';

let failures = 0;
const check = (label: string, got: boolean, want: boolean) => {
  if (got === want) console.log(`PASS  ${label}: got ${got} want ${want}`);
  else { console.log(`FAIL  ${label}: got ${got} want ${want}`); failures++; }
};

// (1) email UNconfirmed but phone confirmed and confirmed_at set → MUST be false.
check('§P0-1 phone-confirmed, email-unconfirmed → NOT email-verified',
  deriveEmailVerified({ email_confirmed_at: null, phone_confirmed_at: '2026-01-01T00:00:00Z', confirmed_at: '2026-01-01T00:00:00Z' } as any),
  false);

// (1b) confirmed_at set (legacy) but email_confirmed_at null → MUST be false (no fallback).
check('§P0-1 confirmed_at set but email_confirmed_at null → NOT email-verified (no fallback)',
  deriveEmailVerified({ email_confirmed_at: null, confirmed_at: '2026-01-01T00:00:00Z' } as any),
  false);

// (2) email_confirmed_at set → true.
check('§P0-1 email_confirmed_at present → email-verified',
  deriveEmailVerified({ email_confirmed_at: '2026-01-01T00:00:00Z' } as any),
  true);

// (3) both email and phone unconfirmed → false.
check('§P0-1 both email and phone unconfirmed → NOT email-verified',
  deriveEmailVerified({ email_confirmed_at: null, phone_confirmed_at: null, confirmed_at: null } as any),
  false);

// edge: missing fields / null user → false (fail-safe).
check('§P0-1 empty object → false', deriveEmailVerified({} as any), false);
check('§P0-1 null user → false', deriveEmailVerified(null), false);
check('§P0-1 undefined user → false', deriveEmailVerified(undefined), false);
// edge: empty-string timestamp is not a confirmation → false.
check('§P0-1 empty-string email_confirmed_at → false', deriveEmailVerified({ email_confirmed_at: '' } as any), false);

console.log(failures === 0 ? '\nALL VERIFIED-DERIVATION TESTS PASSED' : `\n${failures} VERIFIED-DERIVATION TEST(S) FAILED`);
process.exit(failures ? 1 : 0);
