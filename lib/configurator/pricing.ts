import type { BugoConfiguration } from './types';
import { validateQuantity, type QtyRules } from '@/lib/quantity';
import { QTY_ENVELOPE } from '@/lib/pricing/tier-input';
// Pricing is integer-cent only. The intensive-fragrance surcharge is a PER-1.000-UNITS rate
// (rate × quantity / 1.000), computed authoritatively server-side — see repositories/
// configurations.ts (validateAndPrice). The old one-time per-order surcharge model and its
// helpers were removed here so they can never be reintroduced by accident (§MEDIUM-9).

export type ConfigError = 'quantity'|'scent'|'shape'|'front_file'|'front_instructions'|'back_file'|'back_instructions'|null;
// Same rules can run server-side later (pure function, no DOM). Quantity rules default to the
// canonical envelope but callers pass the SELECTED product's rules so the configurator never
// contradicts the server (§HIGH-6).
export function firstConfigError(c: BugoConfiguration, rules: QtyRules = QTY_ENVELOPE): ConfigError {
  if (validateQuantity(c.quantity, rules)) return 'quantity';
  if (!c.scentCode) return 'scent';
  if (!c.shape) return 'shape';
  if (!c.frontArtwork) return 'front_file';
  if (!c.frontInstructions.trim()) return 'front_instructions';
  if (!c.sameBackAsFront) {
    if (!c.backArtwork) return 'back_file';
    if (!c.backInstructions.trim()) return 'back_instructions';
  }
  return null;
}
