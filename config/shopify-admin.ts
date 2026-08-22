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

// §P0-2 Bound every Shopify Admin API call so an unbounded/hung network request can never hold a
// checkout (and its lease) open indefinitely. 15s is comfortably below the checkout lease TTL
// (CHECKOUT_LEASE_SECONDS = 120s), so a full create + read-back + persist always completes inside
// a single renewed lease window — no other request can reclaim the lease mid-operation.
export const SHOPIFY_ADMIN_TIMEOUT_MS = 15_000;
async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs = SHOPIFY_ADMIN_TIMEOUT_MS): Promise<Response> {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), timeoutMs);
  try { return await fetch(url, { ...init, signal: ac.signal }); }
  finally { clearTimeout(timer); }
}

// ---- Admin API token: client-credentials flow, in-memory cache w/ safety margin ----
const SAFETY_MS = 60_000;
let cache: { token: string; expiresAt: number } | null = null;
let inflight: Promise<string> | null = null;

async function requestToken(): Promise<string> {
  if (!isAdminConfigured()) throw new Error('admin_unconfigured');
  // Shopify's token endpoint expects application/x-www-form-urlencoded, NOT JSON.
  // (A JSON body is silently mis-parsed / rejected.) Never log body or token.
  const form = new URLSearchParams({
    client_id: shopifyAdminEnv.clientId,
    client_secret: shopifyAdminEnv.clientSecret,
    grant_type: 'client_credentials',
  });
  const res = await fetchWithTimeout(`https://${shopifyEnv.domain}/admin/oauth/access_token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Accept': 'application/json' },
    body: form.toString(),
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
// §OPTION-3-v4 #4 A typed admin error that records whether the HTTP request was DISPATCHED before
// the failure. A failure BEFORE dispatch (token/config) proves no draft was created; a failure
// AFTER dispatch (timeout/abort/reset/HTTP-5xx) means the mutation MAY have executed — the caller
// must treat draft existence as UNKNOWN and fail closed rather than release a one-time benefit.
export class ShopifyAdminError extends Error {
  dispatched: boolean;
  constructor(message: string, dispatched: boolean) { super(message); this.name = 'ShopifyAdminError'; this.dispatched = dispatched; }
}

export async function adminGraphql<T>(query: string, variables: Record<string, unknown> = {}): Promise<T> {
  let token: string;
  try {
    token = await getAdminToken();
  } catch (e) {
    // token acquisition is BEFORE any request dispatch → definitely no draft.
    throw new ShopifyAdminError(e instanceof Error ? e.message : 'admin_token_error', false);
  }
  let res: Response;
  try {
    res = await fetchWithTimeout(`https://${shopifyEnv.domain}/admin/api/${shopifyEnv.apiVersion}/graphql.json`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': token },
      body: JSON.stringify({ query, variables }),
      cache: 'no-store',
    });
  } catch (e) {
    // fetch threw (timeout / AbortError / connection reset) AFTER the request was dispatched → the
    // mutation MAY have reached Shopify. Draft existence is UNKNOWN.
    throw new ShopifyAdminError(e instanceof Error ? e.message : 'admin_transport_error', true);
  }
  if (!res.ok) {
    // an HTTP response came back but non-2xx. The request reached Shopify; a 5xx could still have
    // created the draft. Treat as dispatched/unknown.
    console.error('[shopify-admin] graphql HTTP', res.status);
    throw new ShopifyAdminError(`admin_http_${res.status}`, true);
  }
  const json = await res.json();
  if (json.errors?.length) {
    // GraphQL-level errors: the request executed and returned a structured error. For a create
    // mutation this generally means it did not create a draft, but we cannot always prove absence,
    // so mark dispatched (unknown) and let the caller fail closed.
    console.error('[shopify-admin] graphql errors');
    throw new ShopifyAdminError('admin_graphql', true);
  }
  return json.data as T;
}
