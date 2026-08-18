'use server';
import { revalidatePath } from 'next/cache';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { getAdminUser } from '@/lib/supabase/admin-auth';
import { isSupabaseConfigured } from '@/lib/supabase/env';

export type QuoteStatus = 'new' | 'in_progress' | 'done';
export type QuoteRow = {
  id: string; createdAt: string; status: QuoteStatus; locale: string;
  company: string | null; name: string | null; email: string | null; phone: string | null;
  productCode: string | null; quantity: number | null; message: string | null;
};
export type QuoteAdminResult = { ok: true } | { ok: false; message: string };

export async function listQuotes(): Promise<QuoteRow[]> {
  if (!isSupabaseConfigured()) return [];
  const sb = createSupabaseServerClient();
  if (!sb) return [];
  const { data } = await sb.from('quotes')
    .select('id,created_at,status,locale,company,name,email,phone,product_code,quantity,message')
    .order('created_at', { ascending: false }).limit(500);
  return (data ?? []).map((q: any) => ({
    id:q.id, createdAt:q.created_at, status:q.status, locale:q.locale,
    company:q.company, name:q.name, email:q.email, phone:q.phone,
    productCode:q.product_code, quantity:q.quantity, message:q.message,
  }));
}

export async function updateQuoteStatus(id: string, status: QuoteStatus): Promise<QuoteAdminResult> {
  const admin = await getAdminUser();
  if (!admin) return { ok: false, message: 'Yetkisiz.' };
  const sb = createSupabaseServerClient();
  if (!sb) return { ok: false, message: 'Supabase yapılandırılmadı.' };
  const { error } = await sb.from('quotes').update({ status }).eq('id', id);
  if (error) return { ok: false, message: error.message };
  revalidatePath('/admin/teklifler');
  return { ok: true };
}

export async function deleteQuote(id: string): Promise<QuoteAdminResult> {
  const admin = await getAdminUser();
  if (!admin) return { ok: false, message: 'Yetkisiz.' };
  const sb = createSupabaseServerClient();
  if (!sb) return { ok: false, message: 'Supabase yapılandırılmadı.' };
  const { error } = await sb.from('quotes').delete().eq('id', id);
  if (error) return { ok: false, message: error.message };
  revalidatePath('/admin/teklifler');
  return { ok: true };
}
