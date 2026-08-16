'use server';
import type { IncomingConfig } from '@/repositories/configurations';
import { validateAndPrice, upsertConfiguration } from '@/repositories/configurations';
import { createUploadTargets, storageBucket, type UploadTarget } from '@/lib/supabase/storage';
import { isSupabaseConfigured } from '@/lib/supabase/env';
import { isShopifyConfigured } from '@/config/shopify';
import { createConfiguredCart, type CartLineAttr } from '@/lib/shopify/cart';
import { formatQty } from '@/lib/money';

const ERR_PREP = 'Die Konfiguration konnte nicht für den Checkout vorbereitet werden. Bitte versuchen Sie es erneut.';

export type BeginResult =
  | { ok: true; configId: string; bucket: string; uploads: UploadTarget[] }
  | { ok: false; code: 'invalid'|'unconfigured'|'error'; message: string };

// Step 1: validate + price (server truth), persist draft, issue signed upload URLs.
export async function beginCheckout(
  cfg: IncomingConfig, fileFields: { field: string; name: string }[],
): Promise<BeginResult> {
  const priced = validateAndPrice(cfg);
  if (!priced.ok) { console.error('[checkout] begin invalid:', priced.error); return { ok:false, code:'invalid', message: ERR_PREP }; }
  if (!isSupabaseConfigured()) return { ok:false, code:'unconfigured',
    message:'Der Checkout ist noch nicht konfiguriert (Supabase fehlt).' };
  const saved = await upsertConfiguration({ ...cfg, ...priced, status:'draft' });
  if (!saved.ok) { console.error('[checkout] begin upsert failed:', saved.message); return { ok:false, code:'error', message: ERR_PREP }; }
  try {
    const uploads = (await createUploadTargets(cfg.configId, fileFields)) ?? [];
    return { ok:true, configId: cfg.configId, bucket: storageBucket, uploads };
  } catch (e:any) { console.error('[checkout] begin signed-url error:', e?.message ?? e); return { ok:false, code:'error', message: ERR_PREP }; }
}

export type FinalizeResult =
  | { ok: true; checkoutUrl: string }
  | { ok: false; code: 'invalid'|'unconfigured'|'missing_variant'|'missing_surcharge'|'error'; message: string };

// Step 2: re-validate, record uploaded paths, create Shopify cart, return checkoutUrl.
export async function finalizeCheckout(
  cfg: IncomingConfig,
  paths: { frontPath?: string|null; backPath?: string|null; supporting?: { field:string; path:string }[] },
): Promise<FinalizeResult> {
  const priced = validateAndPrice(cfg);                          // recompute — never trust client
  if (!priced.ok) { console.error('[checkout] finalize invalid:', priced.error); return { ok:false, code:'invalid', message: ERR_PREP }; }
  if (!isShopifyConfigured()) return { ok:false, code:'unconfigured',
    message:'Der Shopify-Checkout ist noch nicht konfiguriert.' };

  await upsertConfiguration({ ...cfg, ...priced, ...paths, status:'checkout_pending' });

  const attributes: CartLineAttr[] = [
    { key:'BUGO Configuration ID', value: cfg.configId },
    { key:'Kollektion', value: cfg.collectionCode },
    { key:'Menge', value: `${formatQty(cfg.quantity, cfg.locale)}` },
    { key:'Duft', value: cfg.scentCode ?? '-' },
    { key:'Intensität', value: cfg.intensity === 'intense' ? 'Intensivduft' : 'Normalduft' },
    { key:'Form', value: cfg.shape },
    { key:'Vorderseite', value: paths.frontPath ? 'hochgeladen' : '-' },
    { key:'Rückseite', value: cfg.sameBackAsFront ? 'identisch' : (paths.backPath ? 'hochgeladen' : '-') },
  ];
  const cart = await createConfiguredCart({
    collectionCode: cfg.collectionCode, quantity: cfg.quantity,
    intense: cfg.intensity === 'intense', attributes,
  });
  if (!cart.ok) { console.error('[checkout] cartCreate failed:', cart.reason, cart.message); return { ok:false, code: cart.reason, message: cart.message }; }
  await upsertConfiguration({ ...cfg, ...priced, ...paths, status:'checkout_pending', shopifyCartId: cart.cartId });
  return { ok:true, checkoutUrl: cart.checkoutUrl };
}
