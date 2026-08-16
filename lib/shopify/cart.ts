import 'server-only';
import { storefront } from './client';
import { baseVariantFor, shopifySurchargeVariant } from '@/config/shopify';

export type CartLineAttr = { key: string; value: string };
export type CartResult =
  | { ok: true; checkoutUrl: string; cartId: string }
  | { ok: false; reason: 'unconfigured' | 'missing_variant' | 'missing_surcharge' | 'error'; message: string };

const CART_CREATE = `
mutation cartCreate($lines: [CartLineInput!]!) {
  cartCreate(input: { lines: $lines }) {
    cart { id checkoutUrl }
    userErrors { field message }
  }
}`;

export async function createConfiguredCart(args: {
  collectionCode: string; quantity: number; intense: boolean; attributes: CartLineAttr[];
}): Promise<CartResult> {
  const baseVariant = baseVariantFor(args.collectionCode);
  if (!baseVariant) return { ok:false, reason:'missing_variant',
    message:`Shopify-Variante für ${args.collectionCode} ist nicht konfiguriert.` };
  if (args.intense && !shopifySurchargeVariant) return { ok:false, reason:'missing_surcharge',
    message:'Der Intensivduft-Aufpreis ist in Shopify noch nicht konfiguriert.' };

  // One configured BUGO production order = Shopify quantity 1. The physical piece count
  // (1.000–100.000) is a line attribute only — never the Shopify merchandise quantity.
  const lines: any[] = [{ merchandiseId: baseVariant, quantity: 1, attributes: args.attributes }];
  if (args.intense) lines.push({ merchandiseId: shopifySurchargeVariant, quantity: 1,
    attributes: [{ key: 'BUGO', value: 'Intensivduft (+30,00 €, einmalig)' }] });

  try {
    const data = await storefront<{ cartCreate: { cart: { id:string; checkoutUrl:string } | null;
      userErrors: { message:string }[] } }>(CART_CREATE, { lines });
    const ue = data.cartCreate.userErrors;
    if (ue?.length || !data.cartCreate.cart) return { ok:false, reason:'error', message: ue?.[0]?.message ?? 'Cart error' };
    return { ok:true, checkoutUrl: data.cartCreate.cart.checkoutUrl, cartId: data.cartCreate.cart.id };
  } catch (e: any) {
    if (e?.message === 'shopify_unconfigured') return { ok:false, reason:'unconfigured', message:'Shopify ist nicht konfiguriert.' };
    return { ok:false, reason:'error', message: e?.message ?? 'Shopify error' };
  }
}
