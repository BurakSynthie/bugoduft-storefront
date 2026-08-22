// §OPTION-2 DEFECT-5 Authoritative event timestamp for the monotonic order-state machine.
// Ordering correctness depends on this value, so it must be validated and fail closed: an
// invalid/unparseable timestamp must NOT silently become an ordinary event.
//
// Source precedence: the X-Shopify-Triggered-At header (when the event fired) is authoritative;
// fall back to a trusted payload timestamp (cancelled_at for a cancellation, else updated_at).
// Returns a normalized ISO string, or null when no valid authoritative timestamp exists.
export function resolveEventAt(args: {
  triggeredAtHeader: string | null | undefined;
  cancelledAt: string | null | undefined;
  updatedAt: string | null | undefined;
  isCancelled: boolean;
}): string | null {
  const candidates = [
    args.triggeredAtHeader,
    args.isCancelled ? args.cancelledAt : undefined,
    args.updatedAt,
  ];
  for (const c of candidates) {
    const iso = parseTimestamp(c);
    if (iso) return iso;
  }
  return null;
}

function parseTimestamp(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const s = v.trim();
  if (!s) return null;
  const ms = Date.parse(s);
  if (Number.isNaN(ms)) return null;
  // guard against absurd/sentinel values that would corrupt ordering.
  const year = new Date(ms).getUTCFullYear();
  if (year < 2000 || year > 2100) return null;
  return new Date(ms).toISOString();
}
