// Centralized, server-side Shopify configuration. No Shopify IDs in UI components.
// Real product/variant/surcharge IDs are injected via env — never guessed here.
export const shopifyEnv = {
  domain: process.env.SHOPIFY_STORE_DOMAIN ?? '',              // e.g. bugoduft.myshopify.com
  storefrontToken: process.env.SHOPIFY_STOREFRONT_ACCESS_TOKEN ?? '',
  apiVersion: process.env.SHOPIFY_API_VERSION ?? '2026-07',
};

// Intensivduft surcharge rate, in cents PER 1.000 units (scales with quantity — NOT a one-time
// fee). Used server-side as the fallback intense rate when a product has no explicit intense
// option row. The authoritative per-product rate lives in product options; see configurations.ts.
export const INTENSE_SURCHARGE_CENTS = 3000;

export function isShopifyConfigured(): boolean {
  return Boolean(shopifyEnv.domain && shopifyEnv.storefrontToken);
}
