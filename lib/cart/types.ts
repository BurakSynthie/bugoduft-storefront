import type { Locale } from '@/i18n/config';
import type { Intensity, ShapeId } from '@/lib/configurator/types';
import type { FileMeta } from '@/lib/configurator/draft';

// One configured BUGO production item. Serializable: references + a display
// snapshot only. Artwork binaries are NEVER stored here — they stay connected to
// the configuration (in-session registry and, once uploaded, Supabase storage).
export type CartItem = {
  cartItemId: string;
  configId: string;
  productId: string;
  collectionCode: string;
  collectionName: string;
  quantity: number;
  scentCode: string | null;
  scentName: string | null;
  scentCode2: string | null;
  scentName2: string | null;
  intensity: Intensity;
  shape: ShapeId;
  shapeLabel: string;
  frontName: string | null;
  frontMeta: FileMeta | null;
  frontInstructions: string;
  sameBackAsFront: boolean;
  backName: string | null;
  backMeta: FileMeta | null;
  backInstructions: string;
  // upload references recorded when a real upload already happened (Supabase configured)
  frontPath: string | null;
  backPath: string | null;
  supporting: { field: string; path: string }[];
  filesPersisted: boolean;
  basePriceCents: number;
  surchargeCents: number;
  priceCents: number;      // total for this configuration (integer cents)
  currency: 'EUR';
  locale: Locale;
  updatedAt: number;
};

export const CART_KEY = 'bugo_cart_v1';
