// §OPTION-2 static regression: the webhook route must branch ONLY on origin.kind and use ONLY
// the normalized ids from classification. Raw markers (rawConfigId/rawSampleOrderId) may appear
// only at extraction and as the classifyOrigin input — never in a branch or a DB predicate.
// Run: tsx lib/checkout/origin-route.static.test.ts
import { readFileSync } from 'node:fs';

let failures = 0;
const pass = (m: string) => console.log('PASS  ' + m);
const fail = (m: string) => { console.log('FAIL  ' + m); failures++; };

const src = readFileSync('app/api/shopify/orders/route.ts', 'utf8');

// 1. No branch on raw truthiness of a marker: `if (configId)` / `if (sampleOrderId)` and the raw
//    variants must not appear as conditions.
const rawBranch = /if\s*\(\s*(rawConfigId|rawSampleOrderId)\s*\)/.test(src);
!rawBranch ? pass('route does not branch on raw markers') : fail('route branches on a raw marker');

// 2. Raw markers appear only on their declaration lines and the classifyOrigin call.
const rawUses = src.split('\n')
  .map((line, i) => ({ line, i: i + 1 }))
  .filter(({ line }) => /rawConfigId|rawSampleOrderId/.test(line));
const allowed = rawUses.every(({ line }) =>
  /const raw(ConfigId|SampleOrderId)\s*=/.test(line) || /classifyOrigin\(\s*rawConfigId\s*,\s*rawSampleOrderId\s*\)/.test(line));
allowed ? pass('raw markers used only at extraction + classifyOrigin input')
        : fail('raw markers used somewhere else: ' + JSON.stringify(rawUses.map(r => r.i)));

// 3. Every `.eq('id', X)` predicate uses a normalized local (configId/sampleOrderId), never raw.
const eqIdCalls = [...src.matchAll(/\.eq\(\s*'id'\s*,\s*([A-Za-z0-9_]+)\s*\)/g)].map(m => m[1]);
const badEq = eqIdCalls.filter(v => v === 'rawConfigId' || v === 'rawSampleOrderId');
badEq.length === 0 ? pass(`.eq('id', …) predicates use normalized ids only (${eqIdCalls.join(', ')})`)
                   : fail('.eq id predicate uses a raw marker: ' + badEq.join(', '));

// 4. The normalized locals are derived from origin.kind.
/const configId = origin\.kind === 'main'/.test(src) && /const sampleOrderId = origin\.kind === 'sample'/.test(src)
  ? pass('normalized configId/sampleOrderId derived from origin.kind')
  : fail('normalized ids not derived from origin.kind');

// 5. Branching uses origin.kind (not the old string-equality on origin).
/origin\.kind === 'sample'/.test(src) && /origin\.kind === 'main'/.test(src)
  ? pass('route branches on origin.kind for sample and main')
  : fail('route does not branch on origin.kind');

console.log(failures === 0 ? '\nALL ORIGIN-ROUTE STATIC TESTS PASSED' : `\n${failures} ORIGIN-ROUTE STATIC TEST(S) FAILED`);
process.exit(failures ? 1 : 0);
