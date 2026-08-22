// §OPTION-2 — tests for UUID-validating BUGO origin classification that returns kind + normalized id.
// Run: tsx lib/checkout/origin.test.ts
import { classifyOrigin, isValidUuid } from './origin';

let failures = 0;
const eq = (label: string, got: unknown, want: unknown) => {
  const g = JSON.stringify(got), w = JSON.stringify(want);
  if (g === w) console.log(`PASS  ${label}`);
  else { console.log(`FAIL  ${label}: got ${g} want ${w}`); failures++; }
};

const U1 = '11111111-1111-4111-8111-111111111111';
const U2 = '22222222-2222-4222-8222-222222222222';

// kind + normalized id contract
eq('valid config → {main, configId}', classifyOrigin(U1, null), { kind: 'main', configId: U1 });
eq('valid sample → {sample, sampleOrderId}', classifyOrigin(null, U2), { kind: 'sample', sampleOrderId: U2 });
eq('neither → none', classifyOrigin(null, null), { kind: 'none' });
eq('both valid → ambiguous', classifyOrigin(U1, U2), { kind: 'ambiguous' });
eq('invalid config → invalid', classifyOrigin('abc', null), { kind: 'invalid' });
eq('invalid sample → invalid', classifyOrigin(null, 'abc'), { kind: 'invalid' });

// THE INTEGRATION BUG: valid config + whitespace sample → MAIN (sample path impossible)
eq('valid config + whitespace sample → main (sample absent)', classifyOrigin(U1, '   '), { kind: 'main', configId: U1 });
// whitespace config + valid sample → SAMPLE
eq('whitespace config + valid sample → sample', classifyOrigin('   ', U2), { kind: 'sample', sampleOrderId: U2 });
// normalization: surrounding spaces trimmed in the RETURNED id (what enters the DB predicate)
eq('"  config  " → normalized config used', classifyOrigin('  ' + U1 + '  ', null), { kind: 'main', configId: U1 });
eq('"  sample  " → normalized sample used', classifyOrigin(null, '  ' + U2 + '  '), { kind: 'sample', sampleOrderId: U2 });
// whitespace-only both → none
eq('whitespace-only both → none', classifyOrigin('   ', '  '), { kind: 'none' });
// empties / non-strings
eq('empty strings → none', classifyOrigin('', ''), { kind: 'none' });
eq('undefined → none', classifyOrigin(undefined, undefined), { kind: 'none' });
// malformed shapes → invalid (never a UUID predicate)
eq('near-UUID missing char → invalid', classifyOrigin(U1.slice(0, -1), null), { kind: 'invalid' });
eq('non-hex in slot → invalid', classifyOrigin('zzzzzzzz-1111-4111-8111-111111111111', null), { kind: 'invalid' });
// both present, one malformed → ambiguous (never guess, no lookup)
eq('both present, one malformed → ambiguous', classifyOrigin(U1, 'abc'), { kind: 'ambiguous' });

// returned id is always a valid UUID when kind is main/sample (safe for a uuid predicate)
const m = classifyOrigin('  ' + U1 + ' ', null);
eq('returned main id is a valid UUID', m.kind === 'main' && isValidUuid(m.configId), true);
const s = classifyOrigin(null, ' ' + U2 + '  ');
eq('returned sample id is a valid UUID', s.kind === 'sample' && isValidUuid(s.sampleOrderId), true);

// isValidUuid helper
eq('isValidUuid true for UUID', isValidUuid(U1), true);
eq('isValidUuid false for abc', isValidUuid('abc'), false);
eq('isValidUuid false for whitespace', isValidUuid('   '), false);

console.log(failures === 0 ? '\nALL ORIGIN TESTS PASSED' : `\n${failures} ORIGIN TEST(S) FAILED`);
process.exit(failures ? 1 : 0);
