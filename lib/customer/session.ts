import 'server-only';
import { createSupabaseServerClient, createSupabaseServiceClient } from '@/lib/supabase/server';
import { isSupabaseConfigured } from '@/lib/supabase/env';
import { normalizeEmail } from '@/lib/customer/email';
import { deriveEmailVerified } from '@/lib/customer/verified';

export type CustomerUser = { id: string; email: string; emailVerified: boolean };

// The signed-in Supabase auth user acting as a customer. Distinct from admin:
// admin areas separately gate on the admin_users table (requireAdmin). This does
// not grant any admin capability. `emailVerified` reflects Supabase's own EMAIL-specific
// confirmation timestamp (`email_confirmed_at`) — NOT `confirmed_at` (which is email OR phone)
// and NOT a Dashboard assumption — and gates any operation that links historical guest
// commerce (orders / sample credit) by email.
export async function getCustomerUser(): Promise<CustomerUser | null> {
  if (!isSupabaseConfigured()) return null;
  const sb = createSupabaseServerClient();
  if (!sb) return null;
  const { data } = await sb.auth.getUser();
  if (!data.user?.email) return null;
  const u: any = data.user;
  // §P0-1 EMAIL-SPECIFIC verification ONLY (see deriveEmailVerified): a phone-confirmed but
  // email-unconfirmed user must NOT pass. Email-identity linking is an email-security decision.
  const emailVerified = deriveEmailVerified(u);
  // §SMALL normalize at the identity SOURCE so every downstream customer insert / lookup / guest
  // link (ensureCustomerRow, first-order eligibility, sample credit linking, quotes) uses the same
  // canonical email and can rely on EXACT equality.
  return { id: data.user.id, email: normalizeEmail(data.user.email), emailVerified };
}

// Ensure a customers row exists for this auth user. Identity linking to historical guest
// commerce (orders / sample credit) requires a VERIFIED email, tracked explicitly by the
// server-controlled `email_verified_at` marker (0025) and BOUND to the value: the marker is
// non-null only while customers.email equals the normalized currently-verified Auth email.
// Never inferred from auth_user_id alone or from Dashboard settings. Behavior:
//   • verified + email matches   → stamp marker once.
//   • verified + email differs   → server-authoritatively sync email to the verified value,
//                                  then stamp (old/stale/poisoned email stops being trusted).
//   • not verified but marked    → clear the marker (email can no longer be proven).
//   • unverified new row         → account row with NULL marker (never linkable).
//   • verified new row / guest   → claim/insert stamped verified.
// Runs server-side with the service client; own email only. DB errors are surfaced (never
// silently treated as a successful/eligible link).
export async function ensureCustomerRow(user: CustomerUser): Promise<void> {
  const svc = createSupabaseServiceClient();
  if (!svc) return;

  const { data: mine, error: mineErr } = await svc.from('customers')
    .select('id, email, email_verified_at').eq('auth_user_id', user.id).maybeSingle();
  if (mineErr) throw new Error('ensureCustomerRow: lookup failed: ' + mineErr.message);

  if (mine) {
    // INVARIANT: email_verified_at may be non-null ONLY when customers.email is exactly the
    // normalized currently-verified Supabase Auth email for this auth_user_id. So we bind the
    // marker to the VALUE, never to auth_user_id alone.
    if (user.emailVerified) {
      const stored = normalizeEmail(mine.email);
      if (stored !== user.email) {
        // Stored email is stale/poisoned relative to the verified Auth identity. Server-
        // authoritatively synchronize it to the verified value AND (re)stamp verification in
        // the SAME write. This makes the old email cease to be a trusted linking identity.
        const { error } = await svc.from('customers')
          .update({ email: user.email, email_verified_at: new Date().toISOString() })
          .eq('id', mine.id);
        if (error) throw new Error('ensureCustomerRow: identity sync failed: ' + error.message);
      } else if (!mine.email_verified_at) {
        // Email already matches the verified identity; just stamp the marker once.
        const { error } = await svc.from('customers')
          .update({ email_verified_at: new Date().toISOString() }).eq('id', mine.id);
        if (error) throw new Error('ensureCustomerRow: verify-upgrade failed: ' + error.message);
      }
    } else if (mine.email_verified_at) {
      // Auth identity is no longer verified (e.g. email change pending confirmation): the
      // stored email can no longer be proven, so it must NOT remain a trusted identity.
      const { error } = await svc.from('customers')
        .update({ email_verified_at: null }).eq('id', mine.id);
      if (error) throw new Error('ensureCustomerRow: marker clear failed: ' + error.message);
    }
    return;
  }

  if (user.emailVerified) {
    // Claim a pre-existing GUEST row (same normalized email, no auth link) and stamp it
    // verified in the same write.
    const { data: guest, error: guestErr } = await svc.from('customers')
      .select('id').eq('email', user.email).is('auth_user_id', null).maybeSingle();
    if (guestErr) throw new Error('ensureCustomerRow: guest lookup failed: ' + guestErr.message);
    if (guest) {
      const { error } = await svc.from('customers')
        .update({ auth_user_id: user.id, email_verified_at: new Date().toISOString() })
        .eq('id', guest.id);
      if (error) throw new Error('ensureCustomerRow: guest claim failed: ' + error.message);
      return;
    }
    const { error } = await svc.from('customers')
      .insert({ auth_user_id: user.id, email: user.email, email_verified_at: new Date().toISOString() });
    if (error) throw new Error('ensureCustomerRow: verified insert failed: ' + error.message);
    return;
  }

  // Unverified: create an UNVERIFIED account row (email_verified_at stays NULL → never
  // eligible for guest-commerce email linking). Fail safe.
  const { error } = await svc.from('customers')
    .insert({ auth_user_id: user.id, email: user.email });
  if (error) throw new Error('ensureCustomerRow: unverified insert failed: ' + error.message);
}

export type CustomerOrder = {
  id: string; orderNumber: string | null; createdAt: string; opStatus: string;
  currency: string; totalCents: number; carrier: string | null; trackingNumber: string | null;
  shippedAt: string | null; approvalState: string; approvalNote: string | null; designApprovedAt: string | null;
  items: { productId: string | null; quantity: number; config: any }[];
};

// §3 bugo_number is the authoritative customer-facing order number (0001, 0002, …). §2 the
// customer-safe configuration facts live in orders.snapshot (written by the paid-order webhook);
// order_items is no longer relied upon for main orders. total_paid_cents is the real paid total.
const ORDER_SELECT = `id, bugo_number, order_number, created_at, op_status, currency,
  total_cents, total_paid_cents, carrier, tracking_number, shipped_at, approval_state, approval_note,
  design_approved_at, configuration_id, snapshot`;

// §3 prefer bugo_number -> order_number -> short id (never a raw UUID when a real number exists).
function displayOrderNumber(o: any): string | null {
  if (o?.bugo_number) return String(o.bugo_number);
  if (o?.order_number) return String(o.order_number);
  if (o?.id) return String(o.id).slice(0, 8);
  return null;
}

function mapOrder(o: any): CustomerOrder {
  // §2 build the customer-visible item view from the immutable snapshot. One configured product
  // per BUGO order, so a single item derived from the snapshot correctly shows quantity/scent(s)/
  // shape. Falls back to an empty list only when no snapshot exists (legacy pre-snapshot orders).
  const snap = o?.snapshot && typeof o.snapshot === 'object' ? o.snapshot : null;
  const items = snap
    ? [{ productId: snap.productId ?? null, quantity: snap.quantity ?? 0, config: {
        collectionCode: snap.collectionCode ?? null, productCode: snap.productCode ?? null,
        quantity: snap.quantity ?? null, scentCode: snap.scentCode ?? null, scentCode2: snap.scentCode2 ?? null,
        shape: snap.shape ?? null, intensity: snap.intensity ?? null, designMode: snap.designMode ?? null,
      } }]
    : [];
  return { id:o.id, orderNumber:displayOrderNumber(o), createdAt:o.created_at, opStatus:o.op_status,
    currency:o.currency, totalCents:(o.total_paid_cents ?? o.total_cents), carrier:o.carrier, trackingNumber:o.tracking_number,
    shippedAt:o.shipped_at, approvalState:o.approval_state, approvalNote:o.approval_note,
    designApprovedAt:o.design_approved_at, items };
}

// RLS enforces ownership: the customer session only ever sees its own orders.
// §5 fail-closed on DB error: a query failure must NOT masquerade as "no orders" — it throws so
// the caller/route surfaces a controlled error rather than silently showing an empty history.
export async function getCustomerOrders(): Promise<CustomerOrder[]> {
  const sb = createSupabaseServerClient();
  if (!sb) return [];
  const { data, error } = await sb.from('orders').select(ORDER_SELECT).order('created_at', { ascending: false });
  if (error) { console.error('[account] getCustomerOrders failed:', error.message); throw new Error('customer_orders_read_failed'); }
  return (data ?? []).map(mapOrder);
}

export async function getCustomerOrder(id: string): Promise<CustomerOrder | null> {
  const sb = createSupabaseServerClient();
  if (!sb) return null;
  const { data, error } = await sb.from('orders').select(ORDER_SELECT).eq('id', id).maybeSingle();
  if (error) { console.error('[account] getCustomerOrder failed:', error.message); throw new Error('customer_order_read_failed'); }
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
  const { data, error } = await svc.from('quotes').select('id,created_at,quantity,product_code,status').eq('email', email).order('created_at', { ascending: false }).limit(50);
  // §5 fail-closed: a DB error must not look like "no quotes".
  if (error) { console.error('[account] getMyQuotes failed:', error.message); throw new Error('customer_quotes_read_failed'); }
  return (data ?? []).map((q:any)=>({ id:q.id, createdAt:q.created_at, quantity:q.quantity, productCode:q.product_code, status:q.status }));
}
