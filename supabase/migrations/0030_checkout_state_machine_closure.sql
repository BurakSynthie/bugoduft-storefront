-- 0030 — §OPTION-3-v4 FINAL CLOSURE. Additive forward migration (production has 0001–0020;
-- 0021–0029 not yet applied). Closes the remaining checkout state-machine gaps without editing
-- deployed migrations. All functions service-role only (grants at end); search_path pinned empty.

-- ============================ #9 set_sample_invoice must prove one row ============================
-- 0028 defined set_sample_invoice returning void; UPDATE of 0 rows looked like success. Re-define
-- to return boolean and require exactly one row (GET DIAGNOSTICS). No payable sample checkout URL
-- may be returned unless BUGO positively persisted its exact draft id + invoice URL.
-- (Return type changes require DROP first — CREATE OR REPLACE cannot change a function's return type.)
drop function if exists set_sample_invoice(uuid, text, text);
create or replace function set_sample_invoice(p_sample_order_id uuid, p_draft_id text, p_invoice_url text)
returns boolean language plpgsql security definer set search_path = '' as $$
declare v_rows int;
begin
  update public.sample_orders
     set shopify_draft_order_id = p_draft_id, shopify_invoice_url = p_invoice_url
   where id = p_sample_order_id;
  get diagnostics v_rows = row_count;
  return v_rows = 1;
end $$;

-- ============================ #7 intent-carried invoice URL (sample crash window) ============================
-- If the process dies AFTER the intent records the draft id but BEFORE sample_orders.shopify_invoice_url
-- is written, a retry sees existing_draft but no sample URL → dead end. Store the invoice URL on the
-- intent in the SAME statement that records the draft id, so recovery always has a durable source.
alter table checkout_intents add column if not exists invoice_url text;

create or replace function attach_intent_draft_url(
  p_config_id uuid, p_token uuid, p_draft_id text, p_invoice_url text
) returns boolean language plpgsql security definer set search_path = '' as $$
declare v_token uuid; v_rows int;
begin
  select token into v_token from public.checkout_intents where config_id = p_config_id for update;
  if not found or v_token is distinct from p_token then return false; end if;
  update public.checkout_intents
     set shopify_draft_order_id = p_draft_id, invoice_url = p_invoice_url,
         status = 'draft_created', updated_at = now()
   where config_id = p_config_id and token = p_token;
  get diagnostics v_rows = row_count;
  return v_rows = 1;
end $$;

-- Read the intent's recovery URL (service-role helper for the sample resume fallback).
create or replace function get_intent_invoice_url(p_config_id uuid)
returns table(shopify_draft_order_id text, invoice_url text, status text)
language sql security definer set search_path = '' as $$
  select shopify_draft_order_id, invoice_url, status from public.checkout_intents where config_id = p_config_id
$$;

-- ============================ #3A owner-gated prior-Draft clear (expected-id) ============================
-- Clear a configuration's shopify_cart_id ONLY when the caller owns the current lease token AND the
-- stored cart id equals the EXPECTED old draft id. A stale worker (whose token no longer matches)
-- can NEVER clear a newer owner's draft, and even the owner can only clear the specific draft it
-- expected (never a newer D2). Returns true only when exactly one row matched all predicates.
create or replace function clear_config_draft_owned(
  p_config_id uuid, p_token uuid, p_expected_draft_id text
) returns boolean language plpgsql security definer set search_path = '' as $$
declare v_rows int;
begin
  update public.configurations
     set shopify_cart_id = null
   where id = p_config_id
     and checkout_lock_token = p_token
     and shopify_cart_id is not distinct from p_expected_draft_id;
  get diagnostics v_rows = row_count;
  return v_rows = 1;
end $$;

-- ============================ #3B owner-gated checkout snapshot persist ============================
-- Persist checkout-owned configuration fields (status + pricing/benefit/artwork snapshot as JSON)
-- ONLY under current lease ownership, in one statement. A stale worker cannot overwrite status,
-- pricing, benefit or artwork after losing the lease. Returns true iff exactly one owned row wrote.
create or replace function persist_config_snapshot_owned(
  p_config_id uuid, p_token uuid, p_status text, p_snapshot jsonb
) returns boolean language plpgsql security definer set search_path = '' as $$
declare v_rows int;
begin
  update public.configurations
     set status = coalesce(p_status, status),
         checkout_snapshot = p_snapshot
   where id = p_config_id and checkout_lock_token = p_token;
  get diagnostics v_rows = row_count;
  return v_rows = 1;
end $$;

-- checkout_snapshot column for the owned snapshot persistence (payment-critical fields captured for
-- reconciliation/audit at the moment of the owned write).
alter table configurations add column if not exists checkout_snapshot jsonb;

-- ============================ #2 pre-create benefit revalidation ============================
-- Immediately before creating a DISCOUNTED draft, prove the benefit reservation is STILL owned by
-- THIS configuration (not merely held in memory 30+ minutes ago). Atomic re-check + refresh of the
-- reservation window for the SAME config. Returns true only when the benefit is still this config's.
--   first_order_5pct: the customer's claim must be reserved by THIS config and not consumed.
--   sample_credit:    the sample's credit must be reserved by THIS config, unused, sample paid.
create or replace function revalidate_benefit_owned(
  p_benefit_type text, p_config_id uuid, p_customer_id uuid, p_sample_order_id uuid, p_ttl_seconds int default 900
) returns boolean language plpgsql security definer set search_path = '' as $$
declare v_rows int;
begin
  if p_benefit_type = 'first_order_5pct' then
    if p_customer_id is null then return false; end if;
    update public.first_order_claims
       set expires_at = now() + make_interval(secs => p_ttl_seconds)
     where customer_id = p_customer_id and config_id = p_config_id
       and state = 'reserved';
    get diagnostics v_rows = row_count;
    return v_rows = 1;
  elsif p_benefit_type = 'sample_credit' then
    if p_sample_order_id is null then return false; end if;
    update public.sample_orders
       set credit_reservation_expires_at = now() + make_interval(secs => p_ttl_seconds)
     where id = p_sample_order_id
       and credit_reserved_config_id = p_config_id
       and credit_used_at is null
       and payment_state = 'paid';
    get diagnostics v_rows = row_count;
    return v_rows = 1;
  end if;
  -- no benefit → trivially "owned" (nothing discounted to protect).
  return true;
end $$;

-- ============================ #1 pre-delete takeover fence ============================
-- Phase-A fence: BEFORE any external Shopify delete, atomically decide whether the prior config's
-- benefit may be taken. If the prior checkout lease is still LIVE → block (do NOT delete its draft).
-- If expired → replace its token with a fence token so the old worker's renew immediately fails, and
-- report the known draft id (if any) for the caller to delete. Returns (decision, draft_id):
--   'blocked'        → live lease or uncertainty → no takeover, no delete
--   'fenced_safe'    → fenced; no known draft → caller may proceed to certify directly
--   'fenced_delete'  → fenced; a known draft id must be delete-confirmed, then certify
create or replace function fence_prior_config_for_takeover(
  p_prior_config_id uuid, p_fence_token uuid, p_lease_ttl_seconds int default 120
) returns table(decision text, draft_id text)
language plpgsql security definer set search_path = '' as $$
declare v_lock uuid; v_lock_at timestamptz; v_cart text; v_i_status text; v_i_draft text; v_orphans int; v_known text;
begin
  select checkout_lock_token, checkout_lock_at, shopify_cart_id
    into v_lock, v_lock_at, v_cart
    from public.configurations where id = p_prior_config_id for update;

  -- Live prior lease → an old/new worker may be mid-checkout → BLOCK before touching any draft.
  if v_lock is not null and v_lock_at is not null
     and v_lock_at > now() - make_interval(secs => p_lease_ttl_seconds) then
    decision := 'blocked'; draft_id := null; return next; return;
  end if;

  select status, shopify_draft_order_id into v_i_status, v_i_draft
    from public.checkout_intents where config_id = p_prior_config_id for update;

  -- pending intent with no id → unseen draft may exist → BLOCK (cannot safely fence+certify).
  if v_i_status = 'draft_pending' and v_i_draft is null then
    decision := 'blocked'; draft_id := null; return next; return;
  end if;
  -- terminal intents carry no live draft.
  if v_i_status in ('resolved','superseded') then v_i_draft := null; end if;

  select count(*) into v_orphans from public.checkout_orphan_drafts
   where kind = 'orphan_draft' and status = 'open'
     and (config_id = p_prior_config_id or shopify_draft_order_id = v_cart or shopify_draft_order_id = v_i_draft);
  if v_orphans > 0 then decision := 'blocked'; draft_id := null; return next; return; end if;

  -- Expired lease (or none) and no blocking uncertainty → FENCE: install the fence token so the old
  -- worker's renew_config_checkout(token=A) fails immediately, and stop a fresh normal checkout.
  update public.configurations
     set checkout_lock_token = p_fence_token, checkout_lock_at = now()
   where id = p_prior_config_id;

  v_known := coalesce(v_cart, v_i_draft);
  if v_known is not null then decision := 'fenced_delete'; else decision := 'fenced_safe'; end if;
  draft_id := v_known; return next;
end $$;

-- ============================ #5 combined main-draft recovery classifier ============================
-- Classify the COMBINED main recovery state (config.shopify_cart_id + intent draft/status) as ONE
-- object so a retry deletes/recovers the external draft exactly once. Returns (draft_id, both_ref):
--   draft_id  → the single external draft id to delete/verify (null if none)
--   both_ref  → true when config AND intent reference the SAME id (one obligation)
create or replace function classify_main_draft_recovery(p_config_id uuid)
returns table(draft_id text, both_ref boolean, intent_status text)
language plpgsql security definer set search_path = '' as $$
declare v_cart text; v_i_draft text; v_i_status text;
begin
  select shopify_cart_id into v_cart from public.configurations where id = p_config_id;
  select shopify_draft_order_id, status into v_i_draft, v_i_status
    from public.checkout_intents where config_id = p_config_id;
  draft_id := coalesce(v_cart, v_i_draft);
  both_ref := (v_cart is not null and v_i_draft is not null and v_cart = v_i_draft);
  intent_status := v_i_status; return next;
end $$;

-- After the SINGLE external draft is confirmed gone, atomically clear config + supersede intent
-- (one obligation). Idempotent: safe to call again if a prior attempt died mid-transition.
create or replace function supersede_main_draft_coherent(p_config_id uuid, p_draft_id text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  update public.configurations set shopify_cart_id = null
   where id = p_config_id and shopify_cart_id is not distinct from p_draft_id;
  update public.checkout_intents set status = 'superseded', updated_at = now()
   where config_id = p_config_id and status not in ('resolved','superseded')
     and (shopify_draft_order_id is not distinct from p_draft_id or shopify_draft_order_id is null);
end $$;

-- ============================ grants: service-role only ============================
do $$
declare fn text;
begin
  foreach fn in array array[
    'set_sample_invoice(uuid,text,text)',
    'attach_intent_draft_url(uuid,uuid,text,text)',
    'get_intent_invoice_url(uuid)',
    'clear_config_draft_owned(uuid,uuid,text)',
    'persist_config_snapshot_owned(uuid,uuid,text,jsonb)',
    'revalidate_benefit_owned(text,uuid,uuid,uuid,int)',
    'fence_prior_config_for_takeover(uuid,uuid,int)',
    'classify_main_draft_recovery(uuid)',
    'supersede_main_draft_coherent(uuid,text)'
  ] loop
    execute format('revoke all on function %s from public', fn);
    begin execute format('revoke all on function %s from anon', fn); exception when undefined_object then null; end;
    begin execute format('revoke all on function %s from authenticated', fn); exception when undefined_object then null; end;
    execute format('grant execute on function %s to service_role', fn);
  end loop;
end $$;
