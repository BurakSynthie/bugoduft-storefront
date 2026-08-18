import 'server-only';
import { createSupabaseServerClient, createSupabaseServiceClient } from '@/lib/supabase/server';
import { isSupabaseConfigured } from '@/lib/supabase/env';

export type CustomerUser = { id: string; email: string; emailVerified: boolean };

// The signed-in Supabase auth user acting as a customer. Distinct from admin:
// admin areas separately gate on the admin_users table (requireAdmin). This does
// not grant any admin capability. `emailVerified` reflects Supabase's own
// confirmation timestamp — NOT a Dashboard assumption — and gates any operation
// that links historical guest commerce (orders / sample credit) by email.
export async function getCustomerUser(): Promise<CustomerUser | null> {
  if (!isSupabaseConfigured()) return null;
  const sb = createSupabaseServerClient();
  if (!sb) return null;
  const { data } = await sb.auth.getUser();
  if (!data.user?.email) return null;
  const u: any = data.user;
  const emailVerified = Boolean(u.email_confirmed_at ?? u.confirmed_at);
  return { id: data.user.id, email: data.user.email, emailVerified };
}

// Ensure a customers row exists for this auth user. A pre-existing GUEST row (same
// email, no auth link) is claimed ONLY when the email is verified — otherwise we
// create a fresh row keyed to the auth user and never attach unverified identity to
// historical guest data. Runs server-side with the service client; own email only.
export async function ensureCustomerRow(user: CustomerUser): Promise<void> {
  const svc = createSupabaseServiceClient();
  if (!svc) return;
  const { data: mine } = await svc.from('customers').select('id').eq('auth_user_id', user.id).maybeSingle();
  if (mine) return;                                   // already linked
  if (user.emailVerified) {
    const { data: guest } = await svc.from('customers')
      .select('id, auth_user_id').eq('email', user.email).is('auth_user_id', null).maybeSingle();
    if (guest) { await svc.from('customers').update({ auth_user_id: user.id }).eq('id', guest.id); return; }
  }
  await svc.from('customers').insert({ auth_user_id: user.id, email: user.email });
}

export type CustomerOrder = {
  id: string; orderNumber: string | null; createdAt: string; opStatus: string;
  currency: string; totalCents: number; carrier: string | null; trackingNumber: string | null;
  shippedAt: string | null; approvalState: string; approvalNote: string | null; designApprovedAt: string | null;
  items: { productId: string | null; quantity: number; config: any }[];
};

const ORDER_SELECT = `id, order_number, created_at, op_status, currency, total_cents,
  carrier, tracking_number, shipped_at, approval_state, approval_note, design_approved_at,
  order_items(product_id, quantity, config)`;

function mapOrder(o: any): CustomerOrder {
  return { id:o.id, orderNumber:o.order_number, createdAt:o.created_at, opStatus:o.op_status,
    currency:o.currency, totalCents:o.total_cents, carrier:o.carrier, trackingNumber:o.tracking_number,
    shippedAt:o.shipped_at, approvalState:o.approval_state, approvalNote:o.approval_note,
    designApprovedAt:o.design_approved_at,
    items:(o.order_items ?? []).map((i:any)=>({ productId:i.product_id, quantity:i.quantity, config:i.config })) };
}

// RLS enforces ownership: the customer session only ever sees its own orders.
export async function getCustomerOrders(): Promise<CustomerOrder[]> {
  const sb = createSupabaseServerClient();
  if (!sb) return [];
  const { data } = await sb.from('orders').select(ORDER_SELECT).order('created_at', { ascending: false });
  return (data ?? []).map(mapOrder);
}

export async function getCustomerOrder(id: string): Promise<CustomerOrder | null> {
  const sb = createSupabaseServerClient();
  if (!sb) return null;
  const { data } = await sb.from('orders').select(ORDER_SELECT).eq('id', id).maybeSingle();
  return data ? mapOrder(data) : null;
}

export type SavedConfig = { id: string; label: string | null; productCode: string | null; collectionCode: string | null; locale: string; updatedAt: string };
export async function getSavedConfigs(): Promise<SavedConfig[]> {
  const sb = createSupabaseServerClient();
  if (!sb) return [];
  const { data } = await sb.from('saved_configurations')
    .select('id,label,product_code,collection_code,locale,updated_at').order('updated_at', { ascending: false });
  return (data ?? []).map((r:any)=>({ id:r.id, label:r.label, productCode:r.product_code, collectionCode:r.collection_code, locale:r.locale, updatedAt:r.updated_at }));
}

export type MyQuote = { id: string; createdAt: string; quantity: number | null; productCode: string | null; status: string };
// Quotes have no auth link; match on the verified session email via service client (own email only).
export async function getMyQuotes(email: string): Promise<MyQuote[]> {
  const svc = createSupabaseServiceClient();
  if (!svc) return [];
  const { data } = await svc.from('quotes').select('id,created_at,quantity,product_code,status').eq('email', email).order('created_at', { ascending: false }).limit(50);
  return (data ?? []).map((q:any)=>({ id:q.id, createdAt:q.created_at, quantity:q.quantity, productCode:q.product_code, status:q.status }));
}
