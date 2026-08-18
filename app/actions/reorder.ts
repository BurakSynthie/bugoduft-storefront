'use server';
import { beginReorder, type ReorderResult } from '@/repositories/reorder';

export async function reorderCheckoutAction(orderId: string): Promise<ReorderResult> {
  return beginReorder(orderId);
}
