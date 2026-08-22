// §HIGH-13/14/15 — executable regression tests for cart-Edit hydration. PURE — tests the exact
// itemToDraft() used by CartDrawer, proving that pressing Edit preserves the design mode, the
// second scent and the persisted artwork storage references (the fields the old inline mapper
// dropped, which then got nulled at re-add).
//
// Run with:  PATH=/home/claude/.npm-global/bin:$PATH tsx lib/cart/edit.test.ts
import { itemToDraft } from './edit';
import type { CartItem } from './types';

let failures = 0;
function expect(label: string, got: unknown, want: unknown) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) failures++;
  // eslint-disable-next-line no-console
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}: got ${JSON.stringify(got)} want ${JSON.stringify(want)}`);
}

// A fully-populated cart item as it looks AFTER artwork upload (paths persisted).
function baseItem(over: Partial<CartItem> = {}): CartItem {
  return {
    cartItemId: 'ci-1', configId: 'cfg-1', productId: 'p1',
    collectionCode: 'STANDARD', collectionName: 'Standard',
    quantity: 5000, scentCode: 'std-okyanus', scentName: 'Ozean',
    scentCode2: 'std-vanille', scentName2: 'Vanille', intensity: 'intense',
    designMode: 'ready_file', shape: 'round', shapeLabel: 'Rund',
    frontName: 'logo.pdf', frontMeta: { name: 'logo.pdf', type: 'application/pdf', size: 1234 },
    frontInstructions: 'front', sameBackAsFront: false,
    backName: 'back.pdf', backMeta: { name: 'back.pdf', type: 'application/pdf', size: 999 },
    backInstructions: 'back',
    frontPath: 'customer-files/cfg-1/front.pdf',
    backPath: 'customer-files/cfg-1/back.pdf',
    supporting: [{ field: 'supporting-0', path: 'customer-files/cfg-1/extra.pdf' }],
    filesPersisted: true,
    basePriceCents: 24900, surchargeCents: 15000, priceCents: 139500, currency: 'EUR',
    locale: 'de', updatedAt: 1,
    ...over,
  };
}

// §HIGH-13  ready_file survives edit (item 20) + scentCode2 survives edit (item 21).
const d1 = itemToDraft(baseItem());
expect('20 designMode ready_file survives edit', d1.designMode, 'ready_file');
expect('21 scentCode2 survives edit', d1.scentCode2, 'std-vanille');
expect('20b bugo_creates is preserved too',
  itemToDraft(baseItem({ designMode: 'bugo_creates' })).designMode, 'bugo_creates');
expect('21b legacy item without designMode defaults safely',
  itemToDraft(baseItem({ designMode: undefined as any })).designMode, 'bugo_creates');

// §HIGH-14  artwork paths survive edit (item 22) and survive reload+edit (item 23 — reload only
// affects the in-memory File registry, not the serialized cart item, which itemToDraft maps).
expect('22a frontPath survives edit', d1.frontPath, 'customer-files/cfg-1/front.pdf');
expect('22b backPath survives edit', d1.backPath, 'customer-files/cfg-1/back.pdf');
expect('22c supporting paths survive edit', d1.supportingPaths, [{ field: 'supporting-0', path: 'customer-files/cfg-1/extra.pdf' }]);
expect('22d filesPersisted carried through', d1.filesPersisted, true);
expect('23 same paths survive when the item came from reloaded localStorage (structural clone)',
  itemToDraft(JSON.parse(JSON.stringify(baseItem()))).frontPath, 'customer-files/cfg-1/front.pdf');

// §HIGH-14 Scenario D — an item whose artwork was explicitly removed carries null paths (the
// configurator clears front/back.storagePath on remove; a null-path item must round-trip as null).
const removed = itemToDraft(baseItem({ frontPath: null, backPath: null, supporting: [], filesPersisted: false }));
expect('24 explicitly-removed artwork stays cleared (null), not resurrected', [removed.frontPath, removed.backPath, removed.supportingPaths], [null, null, []]);

// Identity + same-config round trip: Edit must reopen the SAME configId (re-add updates in place).
expect('25a Edit reuses the same configId', d1.configId, 'cfg-1');
expect('25b core fields preserved (qty/scent/shape/intensity/notes)',
  [d1.quantity, d1.scentCode, d1.shape, d1.intensity, d1.frontNotes, d1.backNotes, d1.sameBack],
  [5000, 'std-okyanus', 'round', 'intense', 'front', 'back', false]);

// ---------------------------------------------------------------------------------------------
// eslint-disable-next-line no-console
console.log(failures === 0 ? '\nALL CART-EDIT TESTS PASSED' : `\n${failures} CART-EDIT TEST(S) FAILED`);
if (failures > 0) process.exit(1);
