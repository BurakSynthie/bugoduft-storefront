-- 0031 — §OPTION-3-v4 WIRING FIX. Additive forward migration (production is 0001–0020 only;
-- 0021–0030 not yet applied). Fixes concrete V4 integration defects without editing deployed
-- migrations. All functions service-role only (grants at end); search_path pinned empty.
--
-- This migration wires the 0030 pre-delete takeover fence into the real benefit-takeover
-- certification. The prior state machine had two independent post-delete certifiers:
--   certify_prior_config_superseded (0029) — rejects ANY lease newer than 120s, including OUR OWN
--     freshly installed fence token (fence_prior_config_for_takeover sets checkout_lock_at = now()).
-- Wiring the fence in front of the delete therefore needs a certifier that RECOGNIZES the expected
-- fence token as "ours" instead of treating it as a competing live worker. This migration adds that
-- fence-aware certifier; the TypeScript benefit-takeover path (priorConfigProvenSafe) is rewired to:
--   fence → blocked → fail closed
--         → fenced_safe    → certify directly (no external draft to delete)
--         → fenced_delete  → delete the known draft, then certify (fence-token-aware)

-- ============================ #1 fence-aware post-delete certification ============================
-- Certify that a prior config is SAFE FOR BENEFIT TAKEOVER after the caller has (a) fenced it via
-- fence_prior_config_for_takeover(installing p_fence_token) and (b) delete-confirmed any known draft.
-- Unlike certify_prior_config_superseded, a lease whose token EQUALS p_fence_token is recognized as
-- OUR OWN fence (not a competing live worker) and does not abort. Any OTHER live lease token that
-- appeared after we fenced → a real competitor reclaimed → abort. Returns true only when the prior
-- state has not drifted and both references are coherently superseded and the fence is cleared.
create or replace function certify_prior_config_fenced(
  p_prior_config_id uuid, p_fence_token uuid, p_expected_draft_id text
) returns boolean language plpgsql security definer set search_path = '' as $$
declare v_cart text; v_lock uuid; v_lock_at timestamptz; v_i_status text; v_i_draft text; v_orphans int;
begin
  select shopify_cart_id, checkout_lock_token, checkout_lock_at
    into v_cart, v_lock, v_lock_at
    from public.configurations where id = p_prior_config_id for update;
  select status, shopify_draft_order_id into v_i_status, v_i_draft
    from public.checkout_intents where config_id = p_prior_config_id for update;

  -- The lease must still be OUR fence. If some other worker replaced the token after we fenced,
  -- (or the fence was cleared and a fresh live lease taken) → a real competitor → abort.
  if v_lock is distinct from p_fence_token then return false; end if;

  -- A newer draft appeared on either surface that is NOT the one we just deleted → drift → abort.
  if v_cart is not null and v_cart is distinct from p_expected_draft_id then return false; end if;
  if v_i_draft is not null and v_i_draft is distinct from p_expected_draft_id
     and v_i_status not in ('resolved','superseded') then return false; end if;

  -- A new open orphan appeared for this config/draft → payment uncertainty → abort.
  select count(*) into v_orphans from public.checkout_orphan_drafts
   where kind = 'orphan_draft' and status = 'open'
     and (config_id = p_prior_config_id
          or shopify_draft_order_id = p_expected_draft_id
          or (v_cart is not null and shopify_draft_order_id = v_cart));
  if v_orphans > 0 then return false; end if;

  -- State still matches → atomically clear both references and RELEASE the fence (lock back to null),
  -- so the prior config is fully superseded and the benefit may move to the new config.
  update public.configurations
     set shopify_cart_id = null, checkout_lock_token = null, checkout_lock_at = null
   where id = p_prior_config_id
     and checkout_lock_token = p_fence_token
     and (shopify_cart_id is not distinct from p_expected_draft_id or shopify_cart_id is null);
  -- If that owned update matched nothing, the fence drifted between the checks and the write → abort.
  if not found then return false; end if;

  update public.checkout_intents
     set status = 'superseded', updated_at = now()
   where config_id = p_prior_config_id and status not in ('resolved','superseded');
  return true;
end $$;

-- ============================ #3 owner-gated canonical checkout-field persist ============================
-- The V4 checkout previously persisted its canonical pricing/status/benefit/artwork fields with a
-- token-UNGATED upsertConfiguration() AFTER taking the owned snapshot — a stale-owner write window: a
-- worker that lost the lease could still overwrite total_price_cents / benefit_* / status / *_path.
-- This persists ALL those canonical fields in ONE statement gated on the CURRENT checkout lease
-- token (configurations.checkout_lock_token = p_token). A stale worker matches zero rows → false →
-- the caller fails closed. Optional artwork paths use a sentinel-omit convention: passing NULL for a
-- path leaves it unchanged (the "no upload for this side" case is represented by the empty string''),
-- so a retry that supplies no new artwork never nulls a previously stored file.
create or replace function persist_config_checkout_owned(
  p_config_id uuid, p_token uuid, p_status text,
  p_total_price_cents int, p_pre_benefit_total_cents int, p_savings_cents int,
  p_benefit_type text, p_benefit_amount_cents int, p_sample_order_id uuid,
  p_front_path text default null, p_back_path text default null, p_snapshot jsonb default null
) returns boolean language plpgsql security definer set search_path = '' as $$
declare v_rows int;
begin
  update public.configurations
     set status = coalesce(p_status, status),
         total_price_cents = coalesce(p_total_price_cents, total_price_cents),
         pre_benefit_total_cents = coalesce(p_pre_benefit_total_cents, pre_benefit_total_cents),
         savings_cents = coalesce(p_savings_cents, savings_cents),
         benefit_type = p_benefit_type,
         benefit_amount_cents = coalesce(p_benefit_amount_cents, 0),
         sample_order_id = p_sample_order_id,
         front_path = case when p_front_path is null then front_path
                           when p_front_path = '' then null else p_front_path end,
         back_path  = case when p_back_path is null then back_path
                           when p_back_path = '' then null else p_back_path end,
         checkout_snapshot = coalesce(p_snapshot, checkout_snapshot)
   where id = p_config_id and checkout_lock_token = p_token;
  get diagnostics v_rows = row_count;
  return v_rows = 1;
end $$;

-- ============================ #4 terminal-aware combined main-draft classifier ============================
-- 0030's classify_main_draft_recovery coalesced the intent's recorded draft id even when the intent
-- was TERMINAL (resolved/superseded) — so an already-superseded old D could be reported as a live
-- deletion obligation and re-deleted on a retry. A terminal intent carries NO live draft: its draft
-- was already confirmed-deleted/superseded. Redefine so a terminal intent contributes no draft id.
create or replace function classify_main_draft_recovery(p_config_id uuid)
returns table(draft_id text, both_ref boolean, intent_status text)
language plpgsql security definer set search_path = '' as $$
declare v_cart text; v_i_draft text; v_i_status text;
begin
  select shopify_cart_id into v_cart from public.configurations where id = p_config_id;
  select shopify_draft_order_id, status into v_i_draft, v_i_status
    from public.checkout_intents where config_id = p_config_id;
  -- Terminal intent → its recorded draft is already gone; do NOT treat it as a live obligation.
  if v_i_status in ('resolved','superseded') then v_i_draft := null; end if;
  draft_id := coalesce(v_cart, v_i_draft);
  both_ref := (v_cart is not null and v_i_draft is not null and v_cart = v_i_draft);
  intent_status := v_i_status; return next;
end $$;

-- #4 ONE owner-gated atomic transition that BOTH clears configurations.shopify_cart_id AND supersedes
-- the intent, after the single external draft is confirmed gone. Gated on the CURRENT lease token so a
-- stale worker cannot run it. Unlike 0030's supersede_main_draft_coherent (owner-agnostic) followed by
-- a SECOND clear_config_draft_owned expecting the OLD id (which self-conflicts: the first call already
-- nulled the cart id, so the second finds null≠old and fails), this is the SINGLE transition — the
-- caller must NOT run a second conflicting clear afterward. Idempotent: a retry after the transition
-- sees cart id already null / intent already superseded and still returns true (no second delete).
create or replace function supersede_main_draft_owned(
  p_config_id uuid, p_token uuid, p_draft_id text
) returns boolean language plpgsql security definer set search_path = '' as $$
declare v_lock uuid; v_rows int;
begin
  select checkout_lock_token into v_lock from public.configurations where id = p_config_id for update;
  -- Must own the current lease. A stale worker (token mismatch) cannot transition.
  if v_lock is distinct from p_token then return false; end if;
  update public.configurations set shopify_cart_id = null
   where id = p_config_id and checkout_lock_token = p_token
     and shopify_cart_id is not distinct from p_draft_id;
  get diagnostics v_rows = row_count;
  -- Either we just cleared it (1 row) OR it was already null from a prior attempt (idempotent retry).
  update public.checkout_intents set status = 'superseded', updated_at = now()
   where config_id = p_config_id and status not in ('resolved','superseded')
     and (shopify_draft_order_id is not distinct from p_draft_id or shopify_draft_order_id is null);
  return true;
end $$;

-- ============================ grants: service-role only ============================
do $$
declare fn text;
begin
  foreach fn in array array[
    'certify_prior_config_fenced(uuid,uuid,text)',
    'persist_config_checkout_owned(uuid,uuid,text,int,int,int,text,int,uuid,text,text,jsonb)',
    'classify_main_draft_recovery(uuid)',
    'supersede_main_draft_owned(uuid,uuid,text)'
  ] loop
    execute format('revoke all on function %s from public', fn);
    begin execute format('revoke all on function %s from anon', fn); exception when undefined_object then null; end;
    begin execute format('revoke all on function %s from authenticated', fn); exception when undefined_object then null; end;
    execute format('grant execute on function %s to service_role', fn);
  end loop;
end $$;
