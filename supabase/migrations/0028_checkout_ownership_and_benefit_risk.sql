-- 0028 — §OPTION-3-v2 CHECKOUT IDEMPOTENCY / BENEFIT-TAKEOVER / OWNERSHIP HARDENING.
--
-- Fixes five concrete gaps left after 0027:
--   #1 stale benefit takeover only checked configurations.shopify_cart_id, ignoring
--      checkout_intents + open checkout_orphan_drafts → could move a benefit off a config that
--      still has an unseen payable discounted draft.
--   #2 sample checkout had no stable idempotency subject (a fresh sample_orders.id per call).
--   #3 a stale main-lease owner could still persist shopify_cart_id (attach checked only the
--      intent token, not the CURRENT configurations.checkout_lock_token).
--   #5 existing-draft replacement transitions were not gated atomically on ownership.
--
-- PRODUCTION: 0001–0020 applied; 0021–0027 not yet. Additive + idempotent.

-- ============================ #1 cross-config payment-risk ============================
-- Atomic authoritative classification of ALL payment-risk surfaces for a prior configuration,
-- so a stale benefit reservation can never move to a new config while the prior one may still
-- have a payable (discounted) draft. Returns one of:
--   'safe'            → no persisted draft, no risky intent, no open orphan → takeover allowed
--   'existing_draft'  → a known draft id exists (config.shopify_cart_id or intent) → caller must
--                       delete-confirm it and transition BUGO state before takeover
--   'blocked'         → unknown_pending intent, open orphan, or any uncertainty → FAIL CLOSED
-- Also returns the known draft id (if any) so the caller can delete-confirm exactly once.
create or replace function prior_config_payment_risk(p_prior_config_id uuid)
returns table(risk text, draft_id text)
language plpgsql security definer set search_path = '' as $$
declare v_cart text; v_i_status text; v_i_draft text; v_orphans int;
begin
  select shopify_cart_id into v_cart from public.configurations where id = p_prior_config_id;

  select status, shopify_draft_order_id into v_i_status, v_i_draft
    from public.checkout_intents where config_id = p_prior_config_id;
  -- A terminal intent's recorded draft was already confirmed-deleted/superseded → not a live risk.
  if v_i_status in ('resolved','superseded') then
    v_i_draft := null;
  end if;

  select count(*) into v_orphans
    from public.checkout_orphan_drafts
   where kind = 'orphan_draft' and status = 'open'
     and (config_id = p_prior_config_id
          or shopify_draft_order_id = v_cart
          or shopify_draft_order_id = v_i_draft);

  -- Any open orphan for this config/draft → block (payable uncertainty must be resolved first).
  if v_orphans > 0 then
    risk := 'blocked'; draft_id := coalesce(v_cart, v_i_draft); return next; return;
  end if;

  -- A pre-create intent with NO draft id that is not terminal → a draft may exist unseen → block.
  if v_i_status = 'draft_pending' and v_i_draft is null then
    risk := 'blocked'; draft_id := null; return next; return;
  end if;

  -- A known draft id from EITHER surface → must be delete-confirmed before takeover.
  if v_cart is not null or v_i_draft is not null then
    risk := 'existing_draft'; draft_id := coalesce(v_cart, v_i_draft); return next; return;
  end if;

  -- draft_created with no id should not happen; treat any non-terminal intent as blocking.
  if v_i_status is not null and v_i_status not in ('resolved','superseded') then
    risk := 'blocked'; draft_id := null; return next; return;
  end if;

  risk := 'safe'; draft_id := null; return next;
end $$;

-- After a prior draft is CONFIRMED deleted, atomically transition BOTH BUGO references to safe:
-- clear configurations.shopify_cart_id AND supersede the intent. One external Draft, one cleanup.
create or replace function supersede_prior_config_draft(p_prior_config_id uuid, p_draft_id text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  update public.configurations
     set shopify_cart_id = null
   where id = p_prior_config_id and shopify_cart_id = p_draft_id;
  update public.checkout_intents
     set status = 'superseded', updated_at = now()
   where config_id = p_prior_config_id
     and (shopify_draft_order_id = p_draft_id or shopify_draft_order_id is null)
     and status not in ('resolved','superseded');
end $$;

-- ============================ #2 stable sample idempotency ============================
-- A durable request key so an HTTP retry of ONE logical sample checkout maps to the SAME
-- sample_orders row (not a fresh one per call). get_or_create_sample_order is the atomic upsert:
-- first caller inserts + returns is_new=true; a retry with the same key returns the existing row.
alter table sample_orders add column if not exists idempotency_key uuid;
-- §DEFECT-2 persist the payable invoice URL so an idempotent RETRY can RESUME the SAME checkout
-- (return the same URL) instead of dead-ending the customer with "complete the existing checkout".
alter table sample_orders add column if not exists shopify_invoice_url text;
create unique index if not exists uq_sample_orders_idem
  on sample_orders(idempotency_key) where idempotency_key is not null;

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
    -- §DEFECT-1 sample_orders.locale is the `locale` ENUM (0001), not text. Cast explicitly so the
    -- insert matches the real column type (a bare text insert throws 42804 at runtime). Default to
    -- 'de' when the value is not a valid locale rather than failing the whole checkout.
    insert into public.sample_orders(idempotency_key, auth_user_id, customer_id, email, locale,
      amount_cents, credit_cents, payment_state)
    values (p_idempotency_key, p_auth_user_id, p_customer_id, p_email,
      (case when p_locale in ('de','en','fr') then p_locale else 'de' end)::public.locale,
      p_amount_cents, p_credit_cents, 'pending')
    returning sample_orders.id, sample_orders.amount_cents, sample_orders.credit_cents, sample_orders.currency
      into v_id, v_amt, v_cred, v_cur;
    v_new := true; v_ps := 'pending'; v_draft := null; v_url := null;
  end if;
  id := v_id; is_new := v_new; payment_state := v_ps;
  shopify_draft_order_id := v_draft; shopify_invoice_url := v_url;
  amount_cents := v_amt; credit_cents := v_cred; currency := v_cur; return next;
end $$;

-- Persist the invoice URL alongside the draft id for a sample checkout (idempotent resume source).
create or replace function set_sample_invoice(p_sample_order_id uuid, p_draft_id text, p_invoice_url text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  update public.sample_orders
     set shopify_draft_order_id = p_draft_id, shopify_invoice_url = p_invoice_url
   where id = p_sample_order_id;
end $$;

-- ============================ #3/#5 ownership-gated persist ============================
-- Persist shopify_cart_id + move to checkout_pending AND record the intent draft — ONLY when the
-- caller's token still equals the CURRENT configurations.checkout_lock_token, all under ONE row
-- lock. A stale owner (whose lease B reclaimed) can never persist. Returns true on success,
-- false if ownership was lost (caller must delete the just-created draft / record orphan).
create or replace function persist_config_draft_owned(
  p_config_id uuid, p_token uuid, p_draft_id text
) returns boolean language plpgsql security definer set search_path = '' as $$
declare v_lock uuid;
begin
  select checkout_lock_token into v_lock from public.configurations where id = p_config_id for update;
  if v_lock is distinct from p_token then
    return false;                                          -- ownership lost → caller fails closed
  end if;
  update public.configurations
     set shopify_cart_id = p_draft_id, status = 'checkout_pending'
   where id = p_config_id;
  -- coherently record the same draft on the intent (same owner token).
  update public.checkout_intents
     set shopify_draft_order_id = p_draft_id, status = 'draft_created', updated_at = now()
   where config_id = p_config_id and token = p_token;
  return true;
end $$;

-- Resolve the intent to 'resolved' ONLY when the caller still owns the configuration lease. Keeps
-- config draft state and intent state coherent at success; a stale owner cannot mark success.
create or replace function resolve_config_intent_owned(
  p_config_id uuid, p_token uuid
) returns boolean language plpgsql security definer set search_path = '' as $$
declare v_lock uuid;
begin
  select checkout_lock_token into v_lock from public.configurations where id = p_config_id for update;
  if v_lock is distinct from p_token then return false; end if;
  update public.checkout_intents set status = 'resolved', updated_at = now()
   where config_id = p_config_id and token = p_token;
  return true;
end $$;

-- ============================ grants: service-role only ============================
do $$
declare fn text;
begin
  foreach fn in array array[
    'prior_config_payment_risk(uuid)',
    'supersede_prior_config_draft(uuid,text)',
    'get_or_create_sample_order(uuid,uuid,uuid,text,text,int,int)',
    'set_sample_invoice(uuid,text,text)',
    'persist_config_draft_owned(uuid,uuid,text)',
    'resolve_config_intent_owned(uuid,uuid)'
  ] loop
    execute format('revoke all on function %s from public', fn);
    begin execute format('revoke all on function %s from anon', fn); exception when undefined_object then null; end;
    begin execute format('revoke all on function %s from authenticated', fn); exception when undefined_object then null; end;
    execute format('grant execute on function %s to service_role', fn);
  end loop;
end $$;
