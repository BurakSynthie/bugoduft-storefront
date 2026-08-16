'use client';
import { beginCheckout, finalizeCheckout } from '@/app/actions/checkout';
import type { IncomingConfig } from '@/repositories/configurations';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import { getFiles } from '@/lib/configurator/draft';
import type { CartItem } from './types';

export type CheckoutResult = { ok: true; url: string } | { ok: false; message: string };

export type PersistResult =
  | { ok: true; frontPath: string | null; backPath: string | null; supporting: { field: string; path: string }[] }
  | { ok: false };

// Best-effort: persist the draft config + upload its in-session files to Supabase
// (when configured) so the cart holds only path REFERENCES, never binaries.
// Never throws for the caller; a failure just means files upload later at checkout.
export async function persistItemFiles(item: CartItem): Promise<PersistResult> {
  try {
    const files = getFiles(item.configId);
    const fields: { field: string; name: string }[] = [];
    if (files.front) fields.push({ field: 'front', name: files.front.name });
    if (!item.sameBackAsFront && files.back) fields.push({ field: 'back', name: files.back.name });
    files.supporting.forEach((f, i) => { if (f) fields.push({ field: `supporting-${i}`, name: f.name }); });

    const begun = await beginCheckout(incomingOf(item), fields);
    if (!begun.ok) return { ok: false };
    if (!begun.uploads.length) return { ok: true, frontPath: null, backPath: null, supporting: [] };

    const sb = createSupabaseBrowserClient();
    if (!sb) return { ok: false };
    let frontPath: string | null = null, backPath: string | null = null;
    const supporting: { field: string; path: string }[] = [];
    for (const u of begun.uploads) {
      const file = u.field === 'front' ? files.front
        : u.field === 'back' ? files.back
        : files.supporting[Number(u.field.split('-')[1])];
      if (!file) continue;
      const { error } = await sb.storage.from(begun.bucket).uploadToSignedUrl(u.path, u.token, file);
      if (error) return { ok: false };
      if (u.field === 'front') frontPath = u.path;
      else if (u.field === 'back') backPath = u.path;
      else supporting.push({ field: u.field, path: u.path });
    }
    return { ok: true, frontPath, backPath, supporting };
  } catch { return { ok: false }; }
}

function incomingOf(item: CartItem): IncomingConfig {
  return {
    configId: item.configId, locale: item.locale, collectionCode: item.collectionCode,
    scentCode: item.scentCode, intensity: item.intensity, shape: item.shape, quantity: item.quantity,
    frontInstructions: item.frontInstructions, sameBackAsFront: item.sameBackAsFront,
    backInstructions: item.sameBackAsFront ? '' : item.backInstructions,
  };
}

// Sends ONE configured item through the EXISTING approved checkout flow. Server
// re-validates and re-prices; the locally stored price is never trusted.
export async function checkoutCartItem(item: CartItem, fallbackErr: string): Promise<CheckoutResult> {
  const incoming = incomingOf(item);
  const paths: { frontPath?: string | null; backPath?: string | null; supporting?: { field: string; path: string }[] } = {
    frontPath: item.frontPath, backPath: item.backPath, supporting: item.supporting.slice(),
  };

  // Files were already uploaded at add-to-cart time → go straight to finalize.
  if (item.filesPersisted) {
    const fin = await finalizeCheckout(incoming, paths);
    return fin.ok ? { ok: true, url: fin.checkoutUrl } : { ok: false, message: fin.message };
  }

  // Otherwise attempt to upload any files still held in this session, then finalize.
  const files = getFiles(item.configId);
  const fileFields: { field: string; name: string }[] = [];
  if (files.front && !item.frontPath) fileFields.push({ field: 'front', name: files.front.name });
  if (!item.sameBackAsFront && files.back && !item.backPath) fileFields.push({ field: 'back', name: files.back.name });
  files.supporting.forEach((f, i) => { if (f) fileFields.push({ field: `supporting-${i}`, name: f.name }); });

  const begun = await beginCheckout(incoming, fileFields);
  if (!begun.ok) return { ok: false, message: begun.message };

  if (begun.uploads.length) {
    const sb = createSupabaseBrowserClient();
    if (!sb) return { ok: false, message: fallbackErr };
    const sup = paths.supporting ?? [];
    for (const u of begun.uploads) {
      const file = u.field === 'front' ? files.front
        : u.field === 'back' ? files.back
        : files.supporting[Number(u.field.split('-')[1])];
      if (!file) continue;
      const { error } = await sb.storage.from(begun.bucket).uploadToSignedUrl(u.path, u.token, file);
      if (error) return { ok: false, message: fallbackErr };
      if (u.field === 'front') paths.frontPath = u.path;
      else if (u.field === 'back') paths.backPath = u.path;
      else sup.push({ field: u.field, path: u.path });
    }
    paths.supporting = sup;
  }

  const fin = await finalizeCheckout(incoming, paths);
  return fin.ok ? { ok: true, url: fin.checkoutUrl } : { ok: false, message: fin.message };
}
