-- 0027 — §OPTION-3 CHECKOUT IDEMPOTENCY / HARD PROCESS-DEATH RECOVERY.
--
-- CRASH WINDOW (app/actions/checkout.ts + repositories/samples.ts):
--   ... createBugoDraftOrder()  ← Shopify creates a PAYABLE draft
--   <process dies / Vercel freeze / DB stall HERE>
--   ... upsertConfiguration(shopify_cart_id = draft.id)  ← never runs
--   A retry then reads shopify_cart_id = null and blindly mints a SECOND payable draft.
--   The existing checkout_orphan_drafts only helps if the process SURVIVES to record it, so it
--   does not cover hard process death immediately after the Shopify create call.
--
-- WHY NOT RECOVER FROM SHOPIFY: Shopify's Admin API does not provide a reliable, documented
--   filter to look up a Draft Order by our BUGO Configuration ID marker (draft orders are not
--   searchable by tag/attribute via the API — Shopify staff confirm this; the draftOrders `query`
--   arg is an unindexed free-text search, not a deterministic exact-match). Paginating up to
--   hundreds of drafts per retry is not production-safe. So we close the window with a DURABLE
--   BUGO-side intent record written BEFORE the Shopify create call.
--
-- DESIGN: checkout_intents is a per-configuration idempotency/intent record.
--   Lifecycle written by the checkout action:
--     1) BEFORE createBugoDraftOrder → status='draft_pending' (token-owned). This durable row is
--        the marker "a payable draft MAY now exist for this config".
--     2) AFTER a successful create   → status='draft_created' + shopify_draft_order_id.
--     3) AFTER shopify_cart_id persisted / checkout returned → status='draft_created' (terminal-ok).
--     On confirmed deletion/replacement → status='superseded'/'resolved'.
--   A retry consults this row to classify state:
--     'draft_created' + id            → known draft (delete-confirm then replace, or reuse)
--     'draft_pending' + id            → known draft mid-persist (same handling)
--     'draft_pending' + NO id         → UNKNOWN: a draft may exist in Shopify we can't see →
--                                        FAIL CLOSED (do not mint another); surface for reconcile.
--     no row / 'resolved'/'superseded'→ safe to create.
--   Token ownership prevents a stale worker from advancing/clearing a newer owner's intent.
--
-- PRODUCTION: 0001–0020 applied; 0021–0026 not yet. Additive + idempotent.

create table if not exists checkout_intents (
  -- checkout subject id: a configurations.id (main) OR a sample_orders.id (sample). No FK, so the
  -- same idempotency table protects both paths with identical semantics.
  config_id uuid primary key,
  source text not null default 'main_checkout' check (source in ('main_checkout','sample_checkout')),
  sample_order_id uuid,
  token uuid not null,                                   -- checkout-lease ownership token
  status text not null default 'draft_pending'
    check (status in ('draft_pending','draft_created','resolved','superseded')),
  shopify_draft_order_id text,                           -- null until Shopify create returns
  benefit_type text,
  benefit_amount_cents int,
  expected_total_cents int,
  expected_currency text default 'EUR',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table checkout_intents enable row level security;
-- No anon/authenticated access at all; service-role (BYPASSRLS) only. No policies added → default deny.
revoke all on table checkout_intents from anon, authenticated;

-- ---------------- begin_checkout_intent: token-owned pre-create claim ----------------
-- Called BEFORE createBugoDraftOrder. Returns a classification of the CURRENT durable state so the
-- caller can decide (create / reuse / delete-confirm / fail-closed) BEFORE minting a payable draft.
--   returns one of:
--     'created'         → fresh intent row written 'draft_pending' for THIS token (safe to create)
--     'existing_draft'  → a prior draft id is on record (caller must delete-confirm before replace)
--     'unknown_pending' → a prior 'draft_pending' with NO draft id (hard crash window) → FAIL CLOSED
--     'not_owner'       → another live token owns the intent → caller aborts (in_progress)
-- p_token MUST be the caller's current checkout-lease token.
create or replace function begin_checkout_intent(
  p_config_id uuid, p_token uuid, p_source text, p_sample_order_id uuid,
  p_benefit_type text, p_benefit_amount_cents int, p_expected_total_cents int, p_expected_currency text,
  p_stale_seconds int default 120
) returns text language plpgsql security definer set search_path = '' as $$
declare v_status text; v_draft text; v_token uuid; v_updated timestamptz; v_prior_draft text;
begin
  select status, shopify_draft_order_id, token, updated_at
    into v_status, v_draft, v_token, v_updated
    from public.checkout_intents where config_id = p_config_id for update;

  if not found then
    insert into public.checkout_intents(config_id, source, sample_order_id, token, status,
      benefit_type, benefit_amount_cents, expected_total_cents, expected_currency)
    values (p_config_id, p_source, p_sample_order_id, p_token, 'draft_pending',
      p_benefit_type, p_benefit_amount_cents, p_expected_total_cents, coalesce(p_expected_currency,'EUR'));
    return 'created';
  end if;

  -- A terminal/clean prior intent → this checkout may proceed fresh (take ownership).
  if v_status in ('resolved','superseded') then
    update public.checkout_intents
       set token = p_token, source = p_source, sample_order_id = p_sample_order_id, status = 'draft_pending',
           shopify_draft_order_id = null, benefit_type = p_benefit_type,
           benefit_amount_cents = p_benefit_amount_cents, expected_total_cents = p_expected_total_cents,
           expected_currency = coalesce(p_expected_currency,'EUR'), updated_at = now()
     where config_id = p_config_id;
    return 'created';
  end if;

  -- A KNOWN draft id is on record → caller must prove deletion before replacing it.
  if v_draft is not null then
    return 'existing_draft';
  end if;

  -- 'draft_pending' with NO draft id. If it belongs to a still-live token OTHER than ours, another
  -- finalize is in-flight → abort. If it is stale (or ours), it is the HARD CRASH WINDOW: a payable
  -- draft MAY have been created in Shopify that we cannot see. FAIL CLOSED.
  if v_token is distinct from p_token
     and v_updated > now() - make_interval(secs => p_stale_seconds) then
    return 'not_owner';
  end if;
  return 'unknown_pending';
end $$;

-- Record the Shopify draft id on the intent AFTER a successful create (same token only).
create or replace function attach_checkout_intent_draft(
  p_config_id uuid, p_token uuid, p_draft_id text
) returns boolean language plpgsql security definer set search_path = '' as $$
declare v_token uuid;
begin
  select token into v_token from public.checkout_intents where config_id = p_config_id for update;
  if not found or v_token is distinct from p_token then
    return false;                                         -- lost ownership → caller fails closed
  end if;
  update public.checkout_intents
     set shopify_draft_order_id = p_draft_id, status = 'draft_created', updated_at = now()
   where config_id = p_config_id;
  return true;
end $$;

-- Mark an intent resolved/superseded (e.g. a prior draft was confirmed deleted, or checkout done).
create or replace function resolve_checkout_intent(
  p_config_id uuid, p_token uuid, p_status text
) returns boolean language plpgsql security definer set search_path = '' as $$
declare v_token uuid;
begin
  if p_status not in ('resolved','superseded') then
    raise exception 'resolve_checkout_intent: invalid status %', p_status;
  end if;
  select token into v_token from public.checkout_intents where config_id = p_config_id for update;
  if not found or v_token is distinct from p_token then
    return false;
  end if;
  update public.checkout_intents set status = p_status, updated_at = now() where config_id = p_config_id;
  return true;
end $$;

-- Read the current intent draft id (service-role read helper; used by recovery/reconcile paths).
create or replace function get_checkout_intent(p_config_id uuid)
returns table(status text, shopify_draft_order_id text, token uuid)
language sql security definer set search_path = '' as $$
  select status, shopify_draft_order_id, token from public.checkout_intents where config_id = p_config_id
$$;

-- ---------------- grants: service-role only ----------------
do $$
declare fn text;
begin
  foreach fn in array array[
    'begin_checkout_intent(uuid,uuid,text,uuid,text,int,int,text,int)',
    'attach_checkout_intent_draft(uuid,uuid,text)',
    'resolve_checkout_intent(uuid,uuid,text)',
    'get_checkout_intent(uuid)'
  ] loop
    execute format('revoke all on function %s from public', fn);
    begin execute format('revoke all on function %s from anon', fn); exception when undefined_object then null; end;
    begin execute format('revoke all on function %s from authenticated', fn); exception when undefined_object then null; end;
    execute format('grant execute on function %s to service_role', fn);
  end loop;
end $$;
