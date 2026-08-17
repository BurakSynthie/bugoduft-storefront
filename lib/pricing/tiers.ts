// Pure, server-and-client-safe tier math. ratePer1000Cents = price per 1,000 units.
export type PriceTier = { minQty: number; ratePer1000Cents: number; badge?: string | null };

export function pickTier(tiers: PriceTier[], qty: number): PriceTier {
  const sorted = [...tiers].sort((a, b) => a.minQty - b.minQty);
  let chosen = sorted[0];
  for (const t of sorted) if (qty >= t.minQty) chosen = t;   // highest eligible lower/equal tier
  return chosen;
}

export type QuotePrice = {
  ratePer1000Cents: number; totalCents: number; baseTotalCents: number; savingsCents: number; badge: string | null;
};
export function priceQuantity(tiers: PriceTier[], qty: number): QuotePrice {
  const sorted = [...tiers].sort((a, b) => a.minQty - b.minQty);
  const base = sorted[0];
  const tier = pickTier(sorted, qty);
  const blocks = qty / 1000;
  const totalCents = Math.round(tier.ratePer1000Cents * blocks);
  const baseTotalCents = Math.round(base.ratePer1000Cents * blocks);
  return { ratePer1000Cents: tier.ratePer1000Cents, totalCents, baseTotalCents,
    savingsCents: Math.max(0, baseTotalCents - totalCents), badge: tier.badge ?? null };
}

export const DEFAULT_SAMPLE_THRESHOLD = 5000;
export const DEFAULT_SAMPLE_VALUE_EUR = 40;
