import 'server-only';
import { shopifyEnv } from '@/config/shopify';
// Server-only Shopify Admin API auth for our installed Dev Dashboard app
// (client-credentials flow). Never NEXT_PUBLIC_*. Client secret / token never logged.

export const shopifyAdminEnv = {
  clientId: process.env.SHOPIFY_CLIENT_ID ?? '',
  clientSecret: process.env.SHOPIFY_CLIENT_SECRET ?? '',
  // Webhook HMAC uses the app client secret; allow an explicit override for clarity.
  webhookSecret: process.env.SHOPIFY_WEBHOOK_SECRET ?? process.env.SHOPIFY_CLIENT_SECRET ?? '',
};
export function isAdminConfigured(): boolean {
  return Boolean(shopifyEnv.domain && shopifyAdminEnv.clientId && shopifyAdminEnv.clientSecret);
}
export function isWebhookConfigured(): boolean { return Boolean(shopifyAdminEnv.webhookSecret); }
export function getWebhookSecret(): string { return shopifyAdminEnv.webhookSecret; }

// ---- Admin API token: client-credentials flow, in-memory cache w/ safety margin ----
const SAFETY_MS = 60_000;
let cache: { token: string; expiresAt: number } | null = null;
let inflight: Promise<string> | null = null;

async function requestToken(): Promise<string> {
  if (!isAdminConfigured()) throw new Error('admin_unconfigured');
  const res = await fetch(`https://${shopifyEnv.domain}/admin/oauth/access_token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
    body: JSON.stringify({
      client_id: shopifyAdminEnv.clientId,
      client_secret: shopifyAdminEnv.clientSecret,
      grant_type: 'client_credentials',
    }),
    cache: 'no-store',
  });
  if (!res.ok) { console.error('[shopify-admin] token request failed:', res.status); throw new Error(`admin_token_http_${res.status}`); }
  const data = await res.json();               // { access_token, expires_in }
  if (!data?.access_token) throw new Error('admin_token_missing');
  const ttl = Number(data.expires_in ?? 0) * 1000;
  cache = { token: data.access_token, expiresAt: Date.now() + ttl - SAFETY_MS };
  return cache.token;
}

// Returns a valid Admin API token, refreshing shortly before expiry. Cold start => refetch.
export async function getAdminToken(): Promise<string> {
  if (cache && cache.expiresAt > Date.now()) return cache.token;
  if (!inflight) inflight = requestToken().finally(() => { inflight = null; });
  return inflight;
}

// Central Admin GraphQL helper (version centralized via shopifyEnv.apiVersion).
export async function adminGraphql<T>(query: string, variables: Record<string, unknown> = {}): Promise<T> {
  const token = await getAdminToken();
  const res = await fetch(`https://${shopifyEnv.domain}/admin/api/${shopifyEnv.apiVersion}/graphql.json`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': token },
    body: JSON.stringify({ query, variables }),
    cache: 'no-store',
  });
  if (!res.ok) { console.error('[shopify-admin] graphql HTTP', res.status); throw new Error(`admin_http_${res.status}`); }
  const json = await res.json();
  if (json.errors?.length) { console.error('[shopify-admin] graphql errors'); throw new Error('admin_graphql'); }
  return json.data as T;
}
