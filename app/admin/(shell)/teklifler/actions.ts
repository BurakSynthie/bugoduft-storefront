'use server';
import { updateQuoteStatus, deleteQuote, type QuoteStatus, type QuoteAdminResult } from '@/repositories/admin-quotes';
export async function updateQuoteStatusAction(id: string, status: QuoteStatus): Promise<QuoteAdminResult> { return updateQuoteStatus(id, status); }
export async function deleteQuoteAction(id: string): Promise<QuoteAdminResult> { return deleteQuote(id); }
