'use server';
import { saveProduct, type ProductSaveInput, type SaveResult } from '@/repositories/admin-product';
// Persists product content to Supabase (admin/RLS gated) and revalidates storefront routes.
export async function saveProductAction(input: ProductSaveInput): Promise<SaveResult> {
  return saveProduct(input);
}
