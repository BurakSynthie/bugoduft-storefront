import type { BugoConfiguration, Intensity } from './types';
import { validateQuantity } from '@/lib/quantity';
// Pricing is integer-cent only. Quantity does NOT change unit/base price (locked rule).
// Intensive fragrance is a single per-order surcharge, NOT per 1,000 units.
export function surchargeFor(intensity: Intensity, intenseCents: number): number {
  return intensity === 'intense' ? intenseCents : 0;
}
export function totalCents(basePriceCents: number, intensity: Intensity, intenseCents: number): number {
  return basePriceCents + surchargeFor(intensity, intenseCents);
}
export type ConfigError = 'quantity'|'scent'|'shape'|'front_file'|'front_instructions'|'back_file'|'back_instructions'|null;
// Same rules can run server-side later (pure function, no DOM).
export function firstConfigError(c: BugoConfiguration): ConfigError {
  if (validateQuantity(c.quantity, { min:1000, max:100000, step:1000 })) return 'quantity';
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
