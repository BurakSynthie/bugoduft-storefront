// §2 order snapshot builder tests. PURE — run with: tsx lib/checkout/order-snapshot.test.ts
// Proves the customer-safe snapshot carries the configuration facts and NEVER leaks private
// storage paths, pricing, or internal identifiers.
import { buildOrderSnapshot, SNAPSHOT_FORBIDDEN_KEYS } from './order-snapshot';

let failures = 0;
function expect(label: string, got: unknown, want: unknown) {
  const okv = JSON.stringify(got) === JSON.stringify(want);
  if (!okv) failures++;
  // eslint-disable-next-line no-console
  console.log(`${okv ? 'PASS' : 'FAIL'}  ${label}: got ${JSON.stringify(got)} want ${JSON.stringify(want)}`);
}
function ok(label: string, cond: boolean) { if (!cond) failures++; // eslint-disable-next-line no-console
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${label}`); }

const cfgRow = {
  id: 'cfg-1', product_id: 'prod-uuid', collection_code: 'STD', quantity: 5000,
  scent_code: 'S01', scent_code_2: 'S02', shape: 'rectangle', intensity: 'intense', design_mode: 'ready_file',
  front_path: 'configurator/cfg-1/front/secret.pdf', back_path: 'configurator/cfg-1/back/x.pdf',
  supporting: [{ field: 'supporting-0', path: 'configurator/cfg-1/supporting-0/y.png' }],
  total_price_cents: 134000, auth_user_id: 'user-x', benefit_type: 'first_order', sample_order_id: 'so-1',
};
const snap = buildOrderSnapshot(cfgRow);

// customer-visible configuration facts present
expect('quantity', snap.quantity, 5000);
expect('collectionCode', snap.collectionCode, 'STD');
expect('scentCode', snap.scentCode, 'S01');
expect('scentCode2', snap.scentCode2, 'S02');
expect('shape', snap.shape, 'rectangle');
expect('intensity', snap.intensity, 'intense');
expect('designMode', snap.designMode, 'ready_file');
expect('productId', snap.productId, 'prod-uuid');
expect('version', snap.v, 1);

// private/internal data never leaks
const j = JSON.stringify(snap);
for (const k of SNAPSHOT_FORBIDDEN_KEYS) ok(`omits forbidden key "${k}"`, !j.includes(k));
ok('no front path value', !j.includes('secret.pdf'));
ok('no price', !j.includes('134000'));
ok('no auth user id', !j.includes('user-x'));
ok('no benefit type', !j.includes('first_order'));

// robustness
const empty = buildOrderSnapshot(null);
expect('null cfg → null quantity/collection', [empty.quantity, empty.collectionCode], [null, null]);
expect('missing scent2 → null', buildOrderSnapshot({ collection_code: 'STD', quantity: 1000 }).scentCode2, null);
expect('productCode override honored', buildOrderSnapshot({}, { productCode: 'BUGO-STD' }).productCode, 'BUGO-STD');

// eslint-disable-next-line no-console
console.log(failures === 0 ? '\nALL ORDER-SNAPSHOT TESTS PASSED' : `\n${failures} ORDER-SNAPSHOT TEST(S) FAILED`);
if (failures > 0) process.exit(1);
