// §OPTION-2 — executable tests for deterministic Shopify money parsing + verification.
// PURE — exercises the EXACT helpers the webhook uses to gate paid main/sample orders.
// Run with: tsx lib/checkout/money.test.ts
import { parseMoneyToCents, normalizeCurrency, verifyMoney } from './money';

let failures = 0;
const eq = (label: string, got: unknown, want: unknown) => {
  const g = JSON.stringify(got), w = JSON.stringify(want);
  if (g === w) console.log(`PASS  ${label}`);
  else { console.log(`FAIL  ${label}: got ${g} want ${w}`); failures++; }
};

// ---- parseMoneyToCents: deterministic string→cents, reject malformed ----
eq('269.00 → 26900', parseMoneyToCents('269.00'), 26900);
eq('23900.00 → 2390000', parseMoneyToCents('23900.00'), 2390000);
eq('269 → 26900 (no decimals)', parseMoneyToCents('269'), 26900);
eq('40.00 → 4000', parseMoneyToCents('40.00'), 4000);
eq('0.99 → 99', parseMoneyToCents('0.99'), 99);
eq('269.5 → 26950 (one decimal)', parseMoneyToCents('269.5'), 26950);
eq('whitespace trimmed', parseMoneyToCents('  269.00 '), 26900);
eq('number input 269 → 26900', parseMoneyToCents(269), 26900);
// malformed / ambiguous → null
eq('abc → null', parseMoneyToCents('abc'), null);
eq('1.2.3 → null', parseMoneyToCents('1.2.3'), null);
eq('269.000 (3 decimals) → null', parseMoneyToCents('269.000'), null);
eq('negative → null', parseMoneyToCents('-5.00'), null);
eq('empty → null', parseMoneyToCents(''), null);
eq('null → null', parseMoneyToCents(null), null);
eq('undefined → null', parseMoneyToCents(undefined), null);
eq('comma thousands → null', parseMoneyToCents('1,269.00'), null);
eq('plus sign → null', parseMoneyToCents('+5.00'), null);

// ---- normalizeCurrency ----
eq('eur → EUR', normalizeCurrency('eur'), 'EUR');
eq('  Usd  → USD', normalizeCurrency('  Usd  '), 'USD');
eq('bad currency → null', normalizeCurrency('EURO'), null);
eq('empty currency → null', normalizeCurrency(''), null);

// ---- verifyMoney verdicts (the webhook's accept/mismatch decision) ----
eq('(9) €269.00 EUR vs 26900 EUR → ok',
  verifyMoney(26900, 'EUR', '269.00', 'EUR'),
  { ok: true, actualCents: 26900, actualCurrency: 'EUR' });
eq('(10) €268.99 vs expected 26900 → amount_mismatch',
  verifyMoney(26900, 'EUR', '268.99', 'EUR'),
  { ok: false, reason: 'amount_mismatch', actualCents: 26899, actualCurrency: 'EUR' });
eq('(11) USD vs expected EUR → currency_mismatch',
  verifyMoney(26900, 'EUR', '269.00', 'USD'),
  { ok: false, reason: 'currency_mismatch', actualCents: 26900, actualCurrency: 'USD' });
eq('(12) malformed amount → unparseable_amount',
  verifyMoney(26900, 'EUR', '2x9.00', 'EUR'),
  { ok: false, reason: 'unparseable_amount', actualCents: null, actualCurrency: 'EUR' });
eq('(13) sample €40.00 EUR vs 4000 EUR → ok',
  verifyMoney(4000, 'EUR', '40.00', 'EUR'),
  { ok: true, actualCents: 4000, actualCurrency: 'EUR' });
eq('big total 23900.00 vs 2390000 → ok',
  verifyMoney(2390000, 'EUR', '23900.00', 'EUR'),
  { ok: true, actualCents: 2390000, actualCurrency: 'EUR' });

console.log(failures === 0 ? '\nALL MONEY TESTS PASSED' : `\n${failures} MONEY TEST(S) FAILED`);
process.exit(failures ? 1 : 0);
