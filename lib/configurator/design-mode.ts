// §P0-3 — single source of truth for the design-mode value union.
// Pure & dependency-free so both the server validator and the pricing tests can import it.
export type DesignMode = 'bugo_creates' | 'ready_file';
export const DESIGN_MODES: readonly DesignMode[] = ['bugo_creates', 'ready_file'] as const;

// Type guard used server-side to REJECT arbitrary strings from the browser.
export function isDesignMode(v: unknown): v is DesignMode {
  return v === 'bugo_creates' || v === 'ready_file';
}

// Backward-compatible normalizer: a genuine selection is preserved; only a missing/legacy
// value falls back to the safe default. NEVER used to silently rescue an invalid string —
// the server validates with isDesignMode() first and rejects unknown values.
export function normalizeDesignMode(v: unknown): DesignMode {
  return isDesignMode(v) ? v : 'bugo_creates';
}
