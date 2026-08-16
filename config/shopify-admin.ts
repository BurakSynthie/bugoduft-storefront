// Server-only Shopify Admin API + webhook config. Never NEXT_PUBLIC_*.
export const shopifyAdminEnv = {
  adminToken: process.env.SHOPIFY_ADMIN_ACCESS_TOKEN ?? '',
  webhookSecret: process.env.SHOPIFY_WEBHOOK_SECRET ?? '',
};
export function isWebhookConfigured(): boolean { return Boolean(shopifyAdminEnv.webhookSecret); }
export function isAdminApiConfigured(): boolean { return Boolean(shopifyAdminEnv.adminToken); }
