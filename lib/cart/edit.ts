// §HIGH-13 / §HIGH-14 — pure mapping from a cart item back into a configurator draft when the
// customer presses "Edit". Extracted here (dependency-free) so it can be unit-tested and so
// EVERY intentionally-editable field survives the round-trip:
//   Configurator → Cart → (localStorage / reload) → Edit → Configurator → Cart → Checkout
// Fields that were previously dropped by the old inline itemToDraft (and thereby reset at
// re-add) and are now preserved: designMode, scentCode2, and the persisted artwork storage
// references frontPath / backPath / supporting / filesPersisted.
import type { CartItem } from './types';
import type { CfgDraft } from '@/lib/configurator/draft';

export function itemToDraft(item: CartItem): CfgDraft {
  return {
    v: 1,
    configId: item.configId,
    collectionCode: item.collectionCode,
    quantity: item.quantity,
    qtyText: '',
    scentCode: item.scentCode,
    // §HIGH-13 second scent must survive edit (was dropped before).
    scentCode2: item.scentCode2 ?? null,
    // §HIGH-13 design mode must survive edit (a real ready_file choice must not revert).
    designMode: item.designMode ?? 'bugo_creates',
    scentCat: 'all',
    intensity: item.intensity,
    shape: item.shape,
    frontMeta: item.frontMeta,
    frontNotes: item.frontInstructions,
    sameBack: item.sameBackAsFront,
    backMeta: item.backMeta,
    backNotes: item.backInstructions,
    supportingMeta: [],
    // §HIGH-14 persisted storage references must survive edit + reload.
    frontPath: item.frontPath ?? null,
    backPath: item.backPath ?? null,
    supportingPaths: Array.isArray(item.supporting) ? item.supporting.slice() : [],
    filesPersisted: item.filesPersisted ?? false,
    step: 7,
    locale: item.locale,
    updatedAt: Date.now(),
  };
}
