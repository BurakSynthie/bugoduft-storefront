// Centralized, server-side Shopify configuration. No Shopify IDs in UI components.
// Real product/variant/surcharge IDs are injected via env — never guessed here.
export const shopifyEnv = {
  domain: process.env.SHOPIFY_STORE_DOMAIN ?? '',              // e.g. bugoduft.myshopify.com
  storefrontToken: process.env.SHOPIFY_STOREFRONT_ACCESS_TOKEN ?? '',
  apiVersion: process.env.SHOPIFY_API_VERSION ?? '2026-07',
};

// Base product variant per approved collection. Values come from env (GID strings like
// "gid://shopify/ProductVariant/1234567890"). Left blank => honest "not configured".
export const shopifyVariants: Record<'STANDARD'|'PREMIUM'|'DELUXE'|'VIP', string> = {
  STANDARD: process.env.SHOPIFY_VARIANT_STANDARD ?? '',
  PREMIUM:  process.env.SHOPIFY_VARIANT_PREMIUM  ?? '',
  DELUXE:   process.env.SHOPIFY_VARIANT_DELUXE   ?? '',
  VIP:      process.env.SHOPIFY_VARIANT_VIP      ?? '',
};

// Intensivduft (+30,00 €) purchasable variant. Added once per configuration (qty 1).
// If blank, intensive checkout is blocked with an honest error; normal checkout still works.
export const shopifySurchargeVariant = process.env.SHOPIFY_VARIANT_INTENSE_SURCHARGE ?? '';
export const INTENSE_SURCHARGE_CENTS = 3000;

export function isShopifyConfigured(): boolean {
  return Boolean(shopifyEnv.domain && shopifyEnv.storefrontToken);
}
export function baseVariantFor(code: string): string | null {
  return (shopifyVariants as Record<string,string>)[code] || null;
}
