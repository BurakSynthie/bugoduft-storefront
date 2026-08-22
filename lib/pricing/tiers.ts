// Pure, server-and-client-safe tier math. ratePer1000Cents = price per 1,000 units.
export type PriceTier = { minQty: number; ratePer1000Cents: number; badge?: string | null };

// §P0/HIGH-12 — select the HIGHEST tier whose minQty is ≤ qty. If NO tier is at or below qty,
// return null. This must NEVER silently fall back to the first (future, bulk) tier: pricing a
// 1.000-unit order at a 5.000-unit bulk rate is a payment-safety violation. Callers MUST treat
// null as "unpriceable" and fail closed.
export function pickTier(tiers: PriceTier[], qty: number): PriceTier | null {
  const sorted = [...tiers].sort((a, b) => a.minQty - b.minQty);
  let chosen: PriceTier | null = null;
  for (const t of sorted) if (qty >= t.minQty) chosen = t;   // highest eligible lower/equal tier
  return chosen;                                              // null ⇒ no active tier covers qty
}

// True iff at least one tier covers `qty` (a tier with minQty ≤ qty). Used by the admin
// tier-coverage invariant (a product's min_qty MUST be priceable) and by client display guards.
export function hasTierCoverage(tiers: PriceTier[], qty: number): boolean {
  return tiers.some(t => t.minQty <= qty);
}

export type QuotePrice = {
  ratePer1000Cents: number; totalCents: number; baseTotalCents: number; savingsCents: number; badge: string | null;
};

// Fail-closed variant: returns null when no active tier covers qty (never invents a price).
export function priceQuantitySafe(tiers: PriceTier[], qty: number): QuotePrice | null {
  const sorted = [...tiers].sort((a, b) => a.minQty - b.minQty);
  const tier = pickTier(sorted, qty);
  if (!tier) return null;                                    // §P0/HIGH-12 no future-tier fallback
  const base = sorted[0];                                    // cheapest-min tier = "list" reference
  const blocks = qty / 1000;
  const totalCents = Math.round(tier.ratePer1000Cents * blocks);
  const baseTotalCents = Math.round(base.ratePer1000Cents * blocks);
  return { ratePer1000Cents: tier.ratePer1000Cents, totalCents, baseTotalCents,
    savingsCents: Math.max(0, baseTotalCents - totalCents), badge: tier.badge ?? null };
}

// Authoritative pricing: THROWS when no active tier covers qty so server checkout fails closed
// instead of ever charging a wrong (bulk) rate for a smaller quantity.
export function priceQuantity(tiers: PriceTier[], qty: number): QuotePrice {
  const q = priceQuantitySafe(tiers, qty);
  if (!q) throw new Error('no_active_tier_for_quantity');
  return q;
}

// §P0-1 — the storefront "ab/from" price is the rate applicable to the product's MINIMUM
// order quantity (the highest tier whose minQty is ≤ the product min_qty), NEVER the cheapest
// bulk tier. Centralized here so the seed reader and the DB reader can't drift apart. Callers
// MUST pass only ACTIVE tiers (§HIGH-5): an inactive tier must never influence this price.
export function priceFromForMinQty(tiers: PriceTier[], productMinQty: number, fallbackCents: number): number {
  const applicable = tiers.filter(t => t.minQty <= productMinQty).sort((a, b) => a.minQty - b.minQty).pop();
  return applicable ? applicable.ratePer1000Cents : fallbackCents;
}

export const DEFAULT_SAMPLE_THRESHOLD = 5000;
export const DEFAULT_SAMPLE_VALUE_EUR = 40;
