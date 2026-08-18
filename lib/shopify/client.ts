import 'server-only';
import { shopifyEnv, isShopifyConfigured } from '@/config/shopify';
// Minimal Storefront GraphQL client (server-only). Uses the current Cart API.
export async function storefront<T>(query: string, variables: Record<string, unknown> = {}): Promise<T> {
  if (!isShopifyConfigured()) throw new Error('shopify_unconfigured');
  const res = await fetch(`https://${shopifyEnv.domain}/api/${shopifyEnv.apiVersion}/graphql.json`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Shopify-Storefront-Private-Token': shopifyEnv.storefrontToken,
    },
    body: JSON.stringify({ query, variables }),
    cache: 'no-store',
  });
  if (!res.ok) { console.error('[shopify] HTTP', res.status, res.statusText); throw new Error(`shopify_http_${res.status}`); }
  const json = await res.json();
  if (json.errors?.length) { console.error('[shopify] GraphQL errors', json.errors); throw new Error(`shopify_graphql: ${json.errors[0]?.message ?? 'error'}`); }
  return json.data as T;
}
