import 'server-only';
import { createSupabaseServiceClient } from '@/lib/supabase/server';

// ============================================================================
// §P0-3 / §HIGH-9  ORPHAN-RISK DRAFT RECONCILIATION
// ----------------------------------------------------------------------------
// When a Shopify Draft Order (a payable invoice) has been created but the app could NOT persist
// its id, we try to delete the draft. If Shopify does NOT confirm the deletion, we have a payable
// invoice of UNKNOWN status. We must NOT lose that id and must NOT recycle any one-time benefit.
// This records the orphan-risk draft into `checkout_orphan_drafts` (migration 0022) so operations
// can reconcile it (verify/delete in Shopify Admin) and so the system never issues a second
// discounted invoice against the same reserved benefit.
//
// The recording itself is best-effort *for the HTTP response* (we still return a critical error to
// the customer either way), but we log loudly if even the reconciliation write fails, because that
// is the last line of traceability. The Shopify draft id is ALSO already logged at the call site.
// ============================================================================

export type OrphanSource = 'main_checkout' | 'sample_checkout';

export type OrphanDraftRecord = {
  draftOrderId: string;            // Shopify draft/invoice id (gid://…) — MUST never be lost
  source: OrphanSource;
  configId?: string | null;        // main checkout: the configuration id
  sampleOrderId?: string | null;   // sample checkout: the sample_orders id
  benefitType?: string | null;     // benefit that is being held (NOT released) when applicable
  benefitAmountCents?: number | null;
  authUserId?: string | null;
  reason: string;                  // short machine reason (e.g. 'persist_failed_delete_unconfirmed')
};

export async function recordOrphanDraft(rec: OrphanDraftRecord): Promise<{ ok: boolean }> {
  const svc = createSupabaseServiceClient();
  if (!svc) {
    console.error('[reconciliation] ORPHAN DRAFT (no service client to record):', JSON.stringify(rec));
    return { ok: false };
  }
  try {
    const { error } = await svc.from('checkout_orphan_drafts').insert({
      shopify_draft_order_id: rec.draftOrderId,
      source: rec.source,
      config_id: rec.configId ?? null,
      sample_order_id: rec.sampleOrderId ?? null,
      benefit_type: rec.benefitType ?? null,
      benefit_amount_cents: rec.benefitAmountCents ?? null,
      auth_user_id: rec.authUserId ?? null,
      reason: rec.reason,
      status: 'open',
    });
    if (error) {
      // Even the reconciliation write failed — log the full record so the draft id is recoverable
      // from logs. This is the deepest fail-safe.
      console.error('[reconciliation] FAILED to persist orphan draft record — MANUAL RECONCILE REQUIRED:',
        error.message, JSON.stringify(rec));
      return { ok: false };
    }
    return { ok: true };
  } catch (e: any) {
    console.error('[reconciliation] exception persisting orphan draft — MANUAL RECONCILE REQUIRED:',
      e?.message ?? e, JSON.stringify(rec));
    return { ok: false };
  }
}
