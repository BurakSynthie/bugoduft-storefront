// §HIGH-6 / §HIGH-7 — pure, side-effect-free validation for admin-submitted price tiers
// and per-product quantity rules. Extracted so it can be unit-tested without a DB and so
// the admin save path validates ALL user input BEFORE any destructive DB mutation.

// The canonical order envelope (business rule: min 1.000, multiples of 1.000, max 100.000).
// Per-product rules may be STRICTER but must stay inside — and aligned to — this envelope,
// so the configurator (client), validateAndPrice (server) and the configurations.quantity
// DB CHECK can never contradict one another.
export const QTY_ENVELOPE = { min: 1000, max: 100000, step: 1000 } as const;

export type TierInput = {
  minQty: number; ratePer1000Cents: number;
  badgeDe?: string; badgeEn?: string; badgeFr?: string; isActive?: boolean;
};
export type QtyRuleInput = { minQty: number; maxQty: number; qtyStep: number };

// Turkish admin-facing messages (admin panel is Turkish-only).
const ERR_DUP = 'Aynı adet kademesi birden fazla kez kullanılamaz.';
const ERR_TIER_RANGE = 'Fiyat kademesi adedi 1.000 ile 100.000 arasında ve 1.000’in katı olmalıdır.';
const ERR_TIER_NUM = 'Fiyat kademesi değerleri geçersiz.';
const ERR_QTY_RULE = 'Adet kuralları 1.000 ile 100.000 arasında ve 1.000’in katı olmalıdır (min ≤ maks).';

function isBlockOf1000(n: number): boolean {
  return Number.isInteger(n) && n >= QTY_ENVELOPE.min && n <= QTY_ENVELOPE.max && n % QTY_ENVELOPE.step === 0;
}

// Validate per-product quantity rules against the canonical envelope.
export function validateQtyRules(r: QtyRuleInput): { ok: true } | { ok: false; error: string } {
  const min = Math.round(Number(r.minQty)), max = Math.round(Number(r.maxQty)), step = Math.round(Number(r.qtyStep));
  if (!isBlockOf1000(min) || !isBlockOf1000(max) || !isBlockOf1000(step)) return { ok: false, error: ERR_QTY_RULE };
  if (min > max) return { ok: false, error: ERR_QTY_RULE };
  // §HIGH-11 COHERENCE: step alignment is measured from `min`, so the maximum must itself be a
  // selectable quantity — (max - min) must be a whole number of steps. Otherwise the admin could
  // save a max the storefront/server would reject as a bad step (e.g. min 5.000 / max 100.000 /
  // step 2.000, where 100.000 is not reachable). This keeps admin ⇄ configurator ⇄ server ⇄ DB
  // consistent about which quantities are valid.
  if ((max - min) % step !== 0) return { ok: false, error: ERR_QTY_RULE };
  return { ok: true };
}

export type CleanTier = { minQty: number; ratePer1000Cents: number; badgeDe: string; badgeEn: string; badgeFr: string; isActive: boolean };

// Normalize + validate the tier set: integer/positive checks, 1.000-block alignment inside
// the envelope, and duplicate-min_qty rejection — BEFORE any DB write. Returns the cleaned,
// sorted tiers on success.
export function validateTiers(input: TierInput[]): { ok: true; tiers: CleanTier[] } | { ok: false; error: string } {
  const cleaned: CleanTier[] = [];
  for (const t of input ?? []) {
    const minQty = Math.round(Number(t.minQty));
    const rate = Math.round(Number(t.ratePer1000Cents));
    if (!Number.isInteger(rate) || rate < 0) return { ok: false, error: ERR_TIER_NUM };
    if (!isBlockOf1000(minQty)) return { ok: false, error: ERR_TIER_RANGE };
    cleaned.push({
      minQty, ratePer1000Cents: rate,
      badgeDe: t.badgeDe ?? '', badgeEn: t.badgeEn ?? '', badgeFr: t.badgeFr ?? '',
      isActive: t.isActive !== false,
    });
  }
  const seen = new Set<number>();
  for (const t of cleaned) {
    if (seen.has(t.minQty)) return { ok: false, error: ERR_DUP };
    seen.add(t.minQty);
  }
  cleaned.sort((a, b) => a.minQty - b.minQty);
  return { ok: true, tiers: cleaned };
}

const ERR_NO_MIN_TIER = 'Ürünün minimum adedi için aktif bir fiyat kademesi tanımlanmalıdır (en az bir aktif kademe ürün min. adedini kapsamalı).';

// §P0/HIGH-12 TIER COVERAGE INVARIANT — a product must never be saved into an unpriceable state.
// There MUST be at least one ACTIVE tier whose minQty ≤ the product's min_qty, so the product's
// minimum (and therefore every selectable quantity ≥ min, via "highest active tier ≤ Q") is
// always priceable. An INACTIVE tier at the minimum does NOT count. With this guaranteed at
// save time, pickTier() can never fall back to a future bulk tier at runtime.
export function validateTierCoverage(
  tiers: { minQty: number; isActive: boolean }[], productMinQty: number,
): { ok: true } | { ok: false; error: string } {
  const covers = tiers.some(t => t.isActive && t.minQty <= productMinQty);
  return covers ? { ok: true } : { ok: false, error: ERR_NO_MIN_TIER };
}
