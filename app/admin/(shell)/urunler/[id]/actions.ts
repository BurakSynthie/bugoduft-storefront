'use server';
import { upsertProduct, type ProductWrite, type AdminResult } from '@/repositories/admin';
// Server action bridge for the existing editor. Returns honest state until admin auth exists.
export async function saveProductAction(input: ProductWrite): Promise<AdminResult<{ productCode: string }>> {
  return upsertProduct(input);
}
