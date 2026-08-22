// §OPTION-2 DEFECT-5 — tests for authoritative event-timestamp resolution + validation.
// Run: tsx lib/checkout/event-time.test.ts
import { resolveEventAt } from './event-time';

let failures = 0;
const eq = (label: string, got: unknown, want: unknown) => {
  const g = JSON.stringify(got), w = JSON.stringify(want);
  if (g === w) console.log(`PASS  ${label}`);
  else { console.log(`FAIL  ${label}: got ${g} want ${w}`); failures++; }
};

// valid header → normalized ISO
eq('valid header used',
  resolveEventAt({ triggeredAtHeader: '2026-03-01T12:00:00Z', cancelledAt: null, updatedAt: null, isCancelled: false }),
  '2026-03-01T12:00:00.000Z');

// missing header + valid payload updated_at → fallback
eq('fallback to updated_at when header missing',
  resolveEventAt({ triggeredAtHeader: null, cancelledAt: null, updatedAt: '2026-03-01T09:30:00Z', isCancelled: false }),
  '2026-03-01T09:30:00.000Z');

// cancellation prefers cancelled_at over updated_at when header missing
eq('cancellation uses cancelled_at fallback',
  resolveEventAt({ triggeredAtHeader: null, cancelledAt: '2026-03-01T11:00:00Z', updatedAt: '2026-03-01T08:00:00Z', isCancelled: true }),
  '2026-03-01T11:00:00.000Z');

// header takes precedence over payload
eq('header precedence over payload',
  resolveEventAt({ triggeredAtHeader: '2026-03-01T12:00:00Z', cancelledAt: '2026-03-01T11:00:00Z', updatedAt: '2026-03-01T08:00:00Z', isCancelled: true }),
  '2026-03-01T12:00:00.000Z');

// no valid authoritative timestamp → null (fail closed)
eq('all missing → null', resolveEventAt({ triggeredAtHeader: null, cancelledAt: null, updatedAt: null, isCancelled: false }), null);
eq('invalid header + no payload → null', resolveEventAt({ triggeredAtHeader: 'not-a-date', cancelledAt: null, updatedAt: null, isCancelled: false }), null);
eq('invalid header falls back to valid payload',
  resolveEventAt({ triggeredAtHeader: 'garbage', cancelledAt: null, updatedAt: '2026-03-01T09:30:00Z', isCancelled: false }),
  '2026-03-01T09:30:00.000Z');
eq('empty strings → null', resolveEventAt({ triggeredAtHeader: '', cancelledAt: '', updatedAt: '', isCancelled: false }), null);
eq('absurd year rejected → null', resolveEventAt({ triggeredAtHeader: '1200-01-01T00:00:00Z', cancelledAt: null, updatedAt: null, isCancelled: false }), null);
eq('non-string ignored → null', resolveEventAt({ triggeredAtHeader: 12345 as any, cancelledAt: null, updatedAt: null, isCancelled: false }), null);

console.log(failures === 0 ? '\nALL EVENT-TIME TESTS PASSED' : `\n${failures} EVENT-TIME TEST(S) FAILED`);
process.exit(failures ? 1 : 0);
