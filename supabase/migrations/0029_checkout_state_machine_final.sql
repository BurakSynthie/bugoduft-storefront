-- 0029 — §OPTION-3-v3 FINAL STATE-MACHINE HARDENING.
--
-- Additive forward migration (production has 0001–0020; 0021–0028 not yet applied). Corrects three
-- concrete correctness gaps in the 0028 RPCs without editing 0028:
--   #5C persist_config_draft_owned / resolve_config_intent_owned returned true even when the intent
--       UPDATE matched ZERO rows (config could commit while the intent was left incoherent).
--   #6E get_or_create_sample_order must converge under a genuine concurrent unique-key race: the
--       insert loser must re-read the winner instead of surfacing a fake checkout failure.
--   #7  cross-config benefit takeover must be certified by a post-delete RPC that atomically
--       revalidates the fence/expected-draft/intent/orphan state and returns a boolean, rather than
--       a void supersede that always "succeeds".
--
-- All functions are service-role only (grants at end). search_path pinned empty; schema-qualified.

-- ---------------- #5C row-count-checked owned persistence ----------------
-- Re-defines the two owned RPCs so the intent UPDATE must affect exactly one row; otherwise the
-- whole transaction raises (rolls back) — no partial "config committed, intent incoherent" state.
create or replace function persist_config_draft_owned(
  p_config_id uuid, p_token uuid, p_draft_id text
) returns boolean language plpgsql security definer set search_path = '' as $$
declare v_lock uuid; v_rows int;
begin
  select checkout_lock_token into v_lock from public.configurations where id = p_config_id for update;
  if v_lock is distinct from p_token then
    return false;                                          -- ownership lost → caller fails closed
  end if;
  update public.configurations
     set shopify_cart_id = p_draft_id, status = 'checkout_pending'
   where id = p_config_id;
  update public.checkout_intents
     set shopify_draft_order_id = p_draft_id, status = 'draft_created', updated_at = now()
   where config_id = p_config_id and token = p_token;
  get diagnostics v_rows = row_count;
  if v_rows <> 1 then
    -- the intent row is missing or the token no longer matches → refuse partial success.
    raise exception 'persist_config_draft_owned: intent update affected % rows (expected 1)', v_rows
      using errcode = 'check_violation';
  end if;
  return true;
end $$;

create or replace function resolve_config_intent_owned(
  p_config_id uuid, p_token uuid
) returns boolean language plpgsql security definer set search_path = '' as $$
declare v_lock uuid; v_rows int;
begin
  select checkout_lock_token into v_lock from public.configurations where id = p_config_id for update;
  if v_lock is distinct from p_token then return false; end if;
  update public.checkout_intents set status = 'resolved', updated_at = now()
   where config_id = p_config_id and token = p_token;
  get diagnostics v_rows = row_count;
  if v_rows <> 1 then
    raise exception 'resolve_config_intent_owned: intent update affected % rows (expected 1)', v_rows
      using errcode = 'check_violation';
  end if;
  return true;
end $$;

-- ---------------- #6E concurrent-safe sample upsert ----------------
-- On a genuine concurrent insert race the unique index on idempotency_key makes one caller lose;
-- the loser must re-read the winner's row (converge) rather than error the checkout. Re-defined
-- with an exception handler around the insert.
create or replace function get_or_create_sample_order(
  p_idempotency_key uuid, p_auth_user_id uuid, p_customer_id uuid, p_email text, p_locale text,
  p_amount_cents int, p_credit_cents int
) returns table(id uuid, is_new boolean, payment_state text, shopify_draft_order_id text,
                shopify_invoice_url text, amount_cents int, credit_cents int, currency text)
language plpgsql security definer set search_path = '' as $$
declare v_id uuid; v_new boolean := false; v_ps text; v_draft text; v_url text; v_amt int; v_cred int; v_cur text;
begin
  select so.id, so.payment_state, so.shopify_draft_order_id, so.shopify_invoice_url,
         so.amount_cents, so.credit_cents, so.currency
    into v_id, v_ps, v_draft, v_url, v_amt, v_cred, v_cur
    from public.sample_orders so where so.idempotency_key = p_idempotency_key for update;
  if not found then
    begin
      insert into public.sample_orders(idempotency_key, auth_user_id, customer_id, email, locale,
        amount_cents, credit_cents, payment_state)
      values (p_idempotency_key, p_auth_user_id, p_customer_id, p_email,
        (case when p_locale in ('de','en','fr') then p_locale else 'de' end)::public.locale,
        p_amount_cents, p_credit_cents, 'pending')
      returning sample_orders.id, sample_orders.amount_cents, sample_orders.credit_cents, sample_orders.currency
        into v_id, v_amt, v_cred, v_cur;
      v_new := true; v_ps := 'pending'; v_draft := null; v_url := null;
    exception when unique_violation then
      -- §6E another concurrent call won the insert → re-read the winner and converge (no failure).
      select so.id, so.payment_state, so.shopify_draft_order_id, so.shopify_invoice_url,
             so.amount_cents, so.credit_cents, so.currency
        into v_id, v_ps, v_draft, v_url, v_amt, v_cred, v_cur
        from public.sample_orders so where so.idempotency_key = p_idempotency_key;
      v_new := false;
    end;
  end if;
  id := v_id; is_new := v_new; payment_state := v_ps;
  shopify_draft_order_id := v_draft; shopify_invoice_url := v_url;
  amount_cents := v_amt; credit_cents := v_cred; currency := v_cur; return next;
end $$;

-- ---------------- #7 race-safe benefit-takeover certification ----------------
-- Two-phase fence around the EXTERNAL Shopify delete (never held inside a DB transaction):
--   phase 1 (caller): prior_config_payment_risk → existing_draft(D)
--   caller: deleteDraftOrder(D) over the network, CONFIRMED
--   phase 2 (this RPC): atomically REVALIDATE that nothing changed under a row lock, and only then
--     clear config.shopify_cart_id + supersede the intent + fence the prior lease. Returns true
--     ONLY when the state still matches (expected old draft id, no newer draft, no open orphan,
--     lease not newly live). Any drift → false → caller grants NO benefit.
create or replace function certify_prior_config_superseded(
  p_prior_config_id uuid, p_expected_draft_id text
) returns boolean language plpgsql security definer set search_path = '' as $$
declare v_cart text; v_i_status text; v_i_draft text; v_orphans int; v_lease_at timestamptz;
begin
  select shopify_cart_id, checkout_lock_at into v_cart, v_lease_at
    from public.configurations where id = p_prior_config_id for update;
  select status, shopify_draft_order_id into v_i_status, v_i_draft
    from public.checkout_intents where config_id = p_prior_config_id for update;

  -- A newer draft appeared on either surface that is NOT the one we just deleted → drift → abort.
  if v_cart is not null and v_cart is distinct from p_expected_draft_id then return false; end if;
  if v_i_draft is not null and v_i_draft is distinct from p_expected_draft_id
     and v_i_status not in ('resolved','superseded') then return false; end if;

  -- A newly live lease on the prior config → an old/new worker may be mid-checkout → abort.
  if v_lease_at is not null and v_lease_at > now() - interval '120 seconds' then return false; end if;

  -- A new open orphan appeared for this config/draft → payment uncertainty → abort.
  select count(*) into v_orphans from public.checkout_orphan_drafts
   where kind = 'orphan_draft' and status = 'open'
     and (config_id = p_prior_config_id or shopify_draft_order_id = p_expected_draft_id);
  if v_orphans > 0 then return false; end if;

  -- State still matches → atomically clear both references and fence the prior lease token.
  update public.configurations
     set shopify_cart_id = null, checkout_lock_token = null, checkout_lock_at = null
   where id = p_prior_config_id and (shopify_cart_id = p_expected_draft_id or shopify_cart_id is null);
  update public.checkout_intents
     set status = 'superseded', updated_at = now()
   where config_id = p_prior_config_id and status not in ('resolved','superseded');
  return true;
end $$;

-- ---------------- grants: service-role only ----------------
do $$
declare fn text;
begin
  foreach fn in array array[
    'persist_config_draft_owned(uuid,uuid,text)',
    'resolve_config_intent_owned(uuid,uuid)',
    'get_or_create_sample_order(uuid,uuid,uuid,text,text,int,int)',
    'certify_prior_config_superseded(uuid,text)'
  ] loop
    execute format('revoke all on function %s from public', fn);
    begin execute format('revoke all on function %s from anon', fn); exception when undefined_object then null; end;
    begin execute format('revoke all on function %s from authenticated', fn); exception when undefined_object then null; end;
    execute format('grant execute on function %s to service_role', fn);
  end loop;
end $$;
