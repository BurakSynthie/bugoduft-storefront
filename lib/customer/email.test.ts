// §SMALL — executable regression tests for customer email normalization used in identity linking.
// PURE — tests the exact helper used by getCustomerUser / sample insert / webhook linking.
// Run with:  PATH=/home/claude/.npm-global/bin:$PATH tsx lib/customer/email.test.ts
import { normalizeEmail, normalizeEmailOrNull } from './email';

let failures = 0;
function expect(label: string, got: unknown, want: unknown) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) failures++;
  // eslint-disable-next-line no-console
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}: got ${JSON.stringify(got)} want ${JSON.stringify(want)}`);
}

expect('trims + lowercases', normalizeEmail('  Test@Example.COM  '), 'test@example.com');
expect('already-normalized is stable', normalizeEmail('a@b.com'), 'a@b.com');
expect('mixed case + tabs/newlines trimmed', normalizeEmail('\tJohn.Doe@Mail.io\n'), 'john.doe@mail.io');
// Wildcard characters that ILIKE would treat as patterns must be preserved LITERALLY —
// normalization must never turn them into anything else; matching is done with exact equality.
expect('underscore preserved literally', normalizeEmail('a_b@x.com'), 'a_b@x.com');
expect('percent preserved literally', normalizeEmail('a%b@x.com'), 'a%b@x.com');
expect('same normalized email links (case-insensitive equality)',
  normalizeEmail('USER@Foo.com') === normalizeEmail('user@foo.com'), true);
expect('different emails do not collide',
  normalizeEmail('a@x.com') === normalizeEmail('b@x.com'), false);

expect('OrNull: empty → null', normalizeEmailOrNull(''), null);
expect('OrNull: whitespace → null', normalizeEmailOrNull('   '), null);
expect('OrNull: null → null', normalizeEmailOrNull(null), null);
expect('OrNull: undefined → null', normalizeEmailOrNull(undefined), null);
expect('OrNull: value normalized', normalizeEmailOrNull('  A@B.CO '), 'a@b.co');

// eslint-disable-next-line no-console
console.log(failures === 0 ? '\nALL EMAIL TESTS PASSED' : `\n${failures} EMAIL TEST(S) FAILED`);
if (failures > 0) process.exit(1);
