import 'server-only';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { createSupabaseServiceClient } from '@/lib/supabase/server';
import { isSupabaseConfigured } from '@/lib/supabase/env';
import { getAdminUser } from '@/lib/supabase/admin-auth';

const STORAGE_BUCKET = process.env.SUPABASE_STORAGE_BUCKET_PRIVATE ?? 'customer-files';
export type OpStatus = 'received'|'design'|'production'|'shipped';
export const OP_STATUS_TR: Record<OpStatus,string> =
  { received:'Sipariş Alındı', design:'Tasarım', production:'Üretimde', shipped:'Kargolandı' };

function admin() { const c = createSupabaseServerClient(); if (!c) throw new Error('supabase_unconfigured'); return c; }

export async function getDashboardMetrics() {
  if (!isSupabaseConfigured()) return { configured:false as const };
  const c = admin();
  const since = new Date(); since.setHours(0,0,0,0);
  const counts: Record<string,number> = {};
  for (const st of ['received','design','production','shipped'] as OpStatus[]) {
    const { count } = await c.from('orders').select('id',{count:'exact',head:true}).eq('op_status',st);
    counts[st] = count ?? 0;
  }
  const { count: total } = await c.from('orders').select('id',{count:'exact',head:true});
  const { count: today } = await c.from('orders').select('id',{count:'exact',head:true}).gte('created_at', since.toISOString());
  const { data: recent } = await c.from('orders')
    .select('id,bugo_number,customer_first_name,customer_last_name,company,total_paid_cents,currency,op_status,created_at')
    .order('created_at',{ascending:false}).limit(8);
  return { configured:true as const, counts, total: total??0, today: today??0, recent: recent ?? [] };
}

export async function listOrders(opts: { q?:string; status?:string; sort?:'new'|'old' }) {
  if (!isSupabaseConfigured()) return { configured:false as const, rows: [] };
  let query = admin().from('orders')
    .select('id,bugo_number,customer_first_name,customer_last_name,company,customer_email,total_paid_cents,currency,op_status,created_at,configurations(collection_code,quantity)');
  if (opts.status && ['received','design','production','shipped'].includes(opts.status)) query = query.eq('op_status', opts.status);
  if (opts.q) query = query.or(`bugo_number.ilike.%${opts.q}%,customer_email.ilike.%${opts.q}%,company.ilike.%${opts.q}%,customer_last_name.ilike.%${opts.q}%`);
  query = query.order('created_at',{ ascending: opts.sort==='old' });
  const { data } = await query.limit(200);
  return { configured:true as const, rows: data ?? [] };
}

export async function getOrder(id: string) {
  const { data } = await admin().from('orders')
    .select('*, configurations(*)').eq('id', id).maybeSingle();
  if (!data) return null;
  // Completion pass §15: surface the paid-sample / €20-credit funding source for admin
  // order detail — whether this IS a sample purchase (orders.sample_order_id) or a main
  // order that CONSUMED a credit funded by an earlier sample purchase
  // (configurations.sample_order_id). Either way, resolve the underlying sample_orders
  // row so the admin can see amount/payment state/whether the credit was used.
  const cfg: any = (data as any).configurations ?? null;
  const sampleOrderId = (data as any).sample_order_id ?? cfg?.sample_order_id ?? null;
  let sampleOrder: any = null;
  if (sampleOrderId) {
    const { data: so } = await admin().from('sample_orders')
      .select('id, amount_cents, credit_cents, payment_state, shopify_order_id, credit_used_at, created_at')
      .eq('id', sampleOrderId).maybeSingle();
    sampleOrder = so ?? null;
  }
  let reusedFrom: any = null;
  if (cfg?.reused_from_configuration_id) {
    const { data: rf } = await admin().from('configurations')
      .select('id, collection_code, quantity, created_at').eq('id', cfg.reused_from_configuration_id).maybeSingle();
    reusedFrom = rf ?? null;
  }
  return { ...data, sampleOrder, reusedFrom };
}

async function actorEmail() { const a = await getAdminUser(); return a?.email ?? null; }
async function audit(orderId:string, field:string, oldV:any, newV:any) {
  await admin().from('order_audit').insert({ order_id:orderId, actor_email: await actorEmail(),
    field, old_value: oldV==null?null:String(oldV), new_value: newV==null?null:String(newV) });
}

export async function updateOpStatus(id:string, status:OpStatus, force=false) {
  const cur = await getOrder(id); if (!cur) return { ok:false as const };
  // Guard: don't move into production while the customer's design approval isn't recorded.
  if (status === 'production' && !force && (cur as any).approval_state !== 'approved') {
    return { ok:false as const, warn:true as const, message:'Müşteri tasarım onayı henüz kaydedilmedi.' };
  }
  const { error } = await admin().from('orders').update({ op_status: status }).eq('id', id);
  if (error) return { ok:false as const, message:error.message };
  await audit(id, 'op_status', cur.op_status, status);
  return { ok:true as const };
}
export async function approveDesign(id:string) {
  const cur = await getOrder(id); if (!cur) return { ok:false as const };
  const now = new Date().toISOString();
  const { error } = await admin().from('orders').update({ design_approved_at: now, approval_state:'approved', op_status:'production' }).eq('id', id);
  if (error) return { ok:false as const, message:error.message };
  await audit(id, 'design_approved_at', cur.design_approved_at, now);
  await audit(id, 'op_status', cur.op_status, 'production');
  return { ok:true as const };
}
export async function setTracking(id:string, tracking:string) {
  const cur = await getOrder(id); if (!cur) return { ok:false as const };
  const now = new Date().toISOString();
  const { error } = await admin().from('orders')
    .update({ carrier:'iclogi', tracking_number: tracking, shipped_at: now, op_status:'shipped' }).eq('id', id);
  if (error) return { ok:false as const, message:error.message };
  await audit(id, 'tracking_number', cur.tracking_number, tracking);
  await audit(id, 'op_status', cur.op_status, 'shipped');
  return { ok:true as const };
}
export async function saveNotes(id:string, notes:string) {
  const cur = await getOrder(id); if (!cur) return { ok:false as const };
  const { error } = await admin().from('orders').update({ admin_notes: notes }).eq('id', id);
  if (error) return { ok:false as const, message:error.message };
  await audit(id, 'admin_notes', cur.admin_notes, notes);
  return { ok:true as const };
}

// Private artwork access: short-lived signed URL via service role (bucket stays private).
export async function signedArtworkUrl(path: string): Promise<string | null> {
  if (!path) return null;
  const svc = createSupabaseServiceClient(); if (!svc) return null;
  const { data } = await svc.storage.from(STORAGE_BUCKET).createSignedUrl(path, 300);
  return data?.signedUrl ?? null;
}
