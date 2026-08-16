import type { Locale } from '@/i18n/config';
export type ShapeId = 'rectangle'|'square'|'round'|'oval'|'shield'|'heart'|'bugo_decides'|'custom_contour';
export type Intensity = 'normal'|'intense';

// Upload reference. `url` is a dev-only object URL for preview; production persistence
// (Supabase Storage) is a later step — never treated as permanent here.
export type ArtworkRef = {
  name: string; type: string; size: number;
  previewUrl: string | null;          // objectURL for images; null for AI/EPS/PDF
  storagePath: string | null;         // set once Supabase upload exists
  file?: File | null;                 // client-only; used for upload, not persisted
};

// Structured configuration the NEXT phase sends to cart/Supabase/checkout.
export type BugoConfiguration = {
  productId: string; collectionCode: string;
  quantity: number;
  scentCode: string | null;
  intensity: Intensity;
  shape: ShapeId;
  frontArtwork: ArtworkRef | null;
  frontInstructions: string;
  sameBackAsFront: boolean;
  backArtwork: ArtworkRef | null;
  backInstructions: string;
  supportingFiles: ArtworkRef[];
  basePriceCents: number;             // per approved collection price (integer cents)
  surchargeCents: number;             // intensive fragrance (once) or 0
  totalPriceCents: number;            // basePriceCents + surchargeCents
  currency: 'EUR';
  locale: Locale;
};
