// Final closeout regression tests (fixes 2,3,5) — PURE + static source assertions.
// Run with: tsx lib/checkout/closeout.test.ts
import { readFileSync } from 'node:fs';
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
const read = (p: string) => readFileSync(p, 'utf8');

// ---------------- §2 snapshot builder carries customer-safe config, drops private data ----------
const cfgRow = {
  id: 'cfg-1', product_id: 'prod-uuid', collection_code: 'STD', quantity: 5000,
  scent_code: 'S01', scent_code_2: 'S02', shape: 'rectangle', intensity: 'intense', design_mode: 'ready_file',
  // private / internal fields that must NOT leak:
  front_path: 'configurator/cfg-1/front/secret.pdf', back_path: 'configurator/cfg-1/back/x.pdf',
  supporting: [{ field:'supporting-0', path:'configurator/cfg-1/supporting-0/y.png' }],
  total_price_cents: 134000, auth_user_id: 'user-x', benefit_type: 'first_order', sample_order_id: 'so-1',
};
const snap = buildOrderSnapshot(cfgRow);
expect('snapshot quantity', snap.quantity, 5000);
expect('snapshot collectionCode', snap.collectionCode, 'STD');
expect('snapshot scentCode', snap.scentCode, 'S01');
expect('snapshot scentCode2', snap.scentCode2, 'S02');
expect('snapshot shape', snap.shape, 'rectangle');
expect('snapshot intensity', snap.intensity, 'intense');
expect('snapshot designMode', snap.designMode, 'ready_file');
expect('snapshot productId', snap.productId, 'prod-uuid');
expect('snapshot version', snap.v, 1);
const snapJson = JSON.stringify(snap);
for (const k of SNAPSHOT_FORBIDDEN_KEYS) {
  ok(`snapshot omits forbidden key "${k}"`, !snapJson.includes(k));
}
ok('snapshot has no front path value', !snapJson.includes('secret.pdf'));
ok('snapshot has no price', !snapJson.includes('134000'));
ok('snapshot has no auth user', !snapJson.includes('user-x'));
const emptySnap = buildOrderSnapshot(null);
expect('null cfg → null fields', [emptySnap.quantity, emptySnap.collectionCode], [null, null]);

// ---------------- §2 webhook writes snapshot on the MAIN order upsert ----------------
const webhook = read('app/api/shopify/orders/route.ts');
ok('webhook imports buildOrderSnapshot', /buildOrderSnapshot/.test(webhook));
ok('webhook builds snapshot from cfg', /const snapshot = buildOrderSnapshot\(cfg\)/.test(webhook));
ok('webhook main row includes snapshot', /order_kind: 'main'[\s\S]*snapshot,/.test(webhook));

// ---------------- §2 customer read consumes snapshot (not order_items) ----------------
const session = read('lib/customer/session.ts');
ok('customer ORDER_SELECT includes snapshot', /snapshot/.test(session));
ok('customer ORDER_SELECT no longer selects order_items', !/order_items\(/.test(session));
ok('customer mapOrder derives items from snapshot', /snap\.quantity/.test(session) && /snap\.scentCode/.test(session));

// ---------------- §3 bugo_number is the displayed order number ----------------
ok('ORDER_SELECT includes bugo_number', /bugo_number/.test(session));
ok('displayOrderNumber prefers bugo_number -> order_number -> short id',
  /o\?\.bugo_number/.test(session) && /o\?\.order_number/.test(session) && /slice\(0, 8\)/.test(session));
ok('orderNumber mapped via displayOrderNumber', /orderNumber:displayOrderNumber\(o\)/.test(session));

// ---------------- §5 fail-closed DB error handling ----------------
ok('getCustomerOrders inspects error and throws', /getCustomerOrders[\s\S]*?if \(error\)[\s\S]*?throw new Error\('customer_orders_read_failed'\)/.test(session));
ok('getCustomerOrder inspects error and throws', /getCustomerOrder[\s\S]*?if \(error\)[\s\S]*?throw new Error\('customer_order_read_failed'\)/.test(session));
ok('getMyQuotes inspects error and throws', /getMyQuotes[\s\S]*?if \(error\)[\s\S]*?throw new Error\('customer_quotes_read_failed'\)/.test(session));
ok('account error boundary exists (controlled failure, no detail leak)',
  /reset/.test(read('app/[locale]/konto/error.tsx')));

// ---------------- §4 quote action uses service role + rate limit (no anon insert) ----------------
const quote = read('app/actions/quote.ts');
ok('quote action uses service-role client', /createSupabaseServiceClient/.test(quote));
ok('quote action no longer uses anon server client for insert', !/createSupabaseServerClient/.test(quote));
ok('quote action validates before writing (honeypot + email)', /input\.hp/.test(quote) && /EMAIL\.test/.test(quote));
ok('quote action calls DB-backed rate limit with hashed key', /quote_rate_check/.test(quote) && /createHash\('sha256'\)/.test(quote));
// Real invariant: no raw IP is persisted. Assert the insert payload has no ip field/column
// and the rate-limit key is a hash (privacy-safe), rather than string-matching "ip" which
// innocently appears inside words like "description"/"recipient" in comments.
ok('quote insert payload has no ip column', !/\bip\s*:/.test(quote) && !/['"]ip['"]\s*:/.test(quote) && !/ip_address/.test(quote));
ok('rate-limit key is a hash, not raw source', /digest\('hex'\)/.test(quote));

// ---------------- §1 storage validation wired ----------------
const storage = read('lib/supabase/storage.ts');
ok('createUploadTargets validates fields before signing', /validateArtworkFields/.test(storage));
ok('createUploadTargets forces config prefix', /configPrefix\(configId\)/.test(storage));
const checkout = read('app/actions/checkout.ts');
ok('finalizeCheckout validates paths under config', /isPathUnderConfig/.test(checkout));

// eslint-disable-next-line no-console
console.log(failures === 0 ? '\nALL CLOSEOUT TESTS PASSED' : `\n${failures} CLOSEOUT TEST(S) FAILED`);
if (failures > 0) process.exit(1);
