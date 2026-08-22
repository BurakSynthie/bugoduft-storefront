// §OPTION-3-v4 #4 tests for the Shopify create-certainty → caller-decision mapping.
// Run: tsx lib/checkout/create-certainty.test.ts
import { createCertaintyDecision } from './guards';

let failures = 0;
const eq = (label: string, got: unknown, want: unknown) => {
  const g = JSON.stringify(got), w = JSON.stringify(want);
  if (g === w) console.log(`PASS  ${label}`);
  else { console.log(`FAIL  ${label}: got ${g} want ${w}`); failures++; }
};

// definitely_no_draft → safe to release benefit + reset intent
eq('definitely_no_draft → release+reset', createCertaintyDecision('definitely_no_draft'),
  { releaseBenefit: true, recordOrphan: false, keepIntentBlocking: false, intentSafeReset: true });

// confirmed_deleted → same as definite (no draft remains)
eq('confirmed_deleted → release+reset', createCertaintyDecision('confirmed_deleted'),
  { releaseBenefit: true, recordOrphan: false, keepIntentBlocking: false, intentSafeReset: true });

// known_draft_unresolved → orphan + retain benefit + keep blocking
eq('known_draft_unresolved → orphan+retain+block', createCertaintyDecision('known_draft_unresolved'),
  { releaseBenefit: false, recordOrphan: true, keepIntentBlocking: true, intentSafeReset: false });

// unknown_create_outcome → NEVER release, keep blocking, no orphan-by-id (may be unknown:), no reset
eq('unknown_create_outcome → retain+block, no release', createCertaintyDecision('unknown_create_outcome'),
  { releaseBenefit: false, recordOrphan: false, keepIntentBlocking: true, intentSafeReset: false });

// The critical safety invariant: unknown outcome must NOT release the one-time benefit.
const u = createCertaintyDecision('unknown_create_outcome');
(!u.releaseBenefit && u.keepIntentBlocking) ? console.log('PASS  unknown outcome retains benefit + blocks intent (core safety)')
  : (() => { console.log('FAIL  unknown outcome released benefit'); failures++; })();

console.log(failures === 0 ? '\nALL CREATE-CERTAINTY TESTS PASSED' : `\n${failures} CREATE-CERTAINTY TEST(S) FAILED`);
process.exit(failures ? 1 : 0);
