'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { Locale } from '@/i18n/config';
import { saveDraft, newConfigId, setLive, type CfgDraft } from '@/lib/configurator/draft';
import { configuratorPath } from '@/lib/routing';
import { Button } from '@/components/ui';

// Builds a NEW draft from a previous order and opens the configurator. The original
// order is never modified. Artwork binaries are not restored (private storage), so
// the customer re-uploads/design is re-confirmed — never a silent reorder.
export default function ReorderButton({ locale, seed, collectionCode, label }:
  { locale: Locale; seed: Partial<CfgDraft>; collectionCode: string | null; label: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  function onClick() {
    setBusy(true);
    const id = newConfigId();
    const draft: CfgDraft = {
      v: 1, configId: id,
      collectionCode: collectionCode ?? seed.collectionCode,
      quantity: seed.quantity ?? 1000, qtyText: String(seed.quantity ?? 1000),
      scentCode: seed.scentCode ?? null, scentCode2: seed.scentCode2 ?? null,
      scentCat: 'all', intensity: seed.intensity ?? 'normal', shape: seed.shape ?? ('rechteck' as any),
      frontMeta: null, frontNotes: seed.frontNotes ?? '', sameBack: seed.sameBack ?? true,
      backMeta: null, backNotes: seed.backNotes ?? '', supportingMeta: [],
      step: 0, locale, updatedAt: Date.now(),
    };
    saveDraft(draft); setLive(id);
    router.push(`${configuratorPath(locale)}${collectionCode ? `?k=${collectionCode}` : ''}`);
  }
  return <Button onClick={busy ? undefined : onClick} variant="primary">{busy ? '…' : label}</Button>;
}
