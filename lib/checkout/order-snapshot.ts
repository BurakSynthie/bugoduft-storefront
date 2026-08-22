// §2 Customer-safe immutable order snapshot. Built from the authoritative configuration row
// at webhook time and stored in orders.snapshot (jsonb, already present since migration 0001).
// This is the LOWEST-RISK fix for "customer order detail shows empty items": the main webhook
// never wrote order_items, and BUGO pricing is per-1,000 pieces so a synthetic unit_price_cents
// would be mathematically misleading. The snapshot carries only the customer-visible
// configuration facts — NEVER private storage URLs, secrets, Shopify access data, or lease
// tokens.
export type OrderConfigSnapshot = {
  v: 1;
  productId: string | null;
  productCode: string | null;
  collectionCode: string | null;
  quantity: number | null;
  scentCode: string | null;
  scentCode2: string | null;
  shape: string | null;
  intensity: string | null;
  designMode: string | null;
};

// `cfg` is the configurations row (snake_case) resolved in the webhook. Only whitelisted,
// customer-safe fields are copied — front_path/back_path/supporting (private storage paths),
// pricing internals, benefit/lease/shopify identifiers are intentionally excluded.
export function buildOrderSnapshot(cfg: Record<string, any> | null, opts?: { productCode?: string | null }): OrderConfigSnapshot {
  const num = (v: any): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);
  const str = (v: any): string | null => (typeof v === 'string' && v.trim() ? v : null);
  return {
    v: 1,
    productId: str(cfg?.product_id),
    productCode: str(opts?.productCode ?? cfg?.product_code ?? null),
    collectionCode: str(cfg?.collection_code),
    quantity: num(cfg?.quantity),
    scentCode: str(cfg?.scent_code),
    scentCode2: str(cfg?.scent_code_2),
    shape: str(cfg?.shape),
    intensity: str(cfg?.intensity),
    designMode: str(cfg?.design_mode),
  };
}

// Keys a snapshot must NEVER contain (defense-in-depth assertion used by tests).
export const SNAPSHOT_FORBIDDEN_KEYS = [
  'front_path', 'back_path', 'supporting', 'frontPath', 'backPath',
  'token', 'lease', 'secret', 'shopify_order_id', 'access_token', 'total_price_cents',
];
