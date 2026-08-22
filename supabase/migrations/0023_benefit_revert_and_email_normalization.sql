-- BUGO DUFT — Final patch (v2). ADDITIVE ONLY. Apply AFTER 0021 and 0022.
-- Does NOT modify 0001–0022. Every statement is idempotent / re-runnable. Covers:
--   §HIGH-5  release_or_revert_sample_credit / release_or_revert_first_order — a CANCELLED order
--            must not permanently consume a one-time benefit. Ordinary release cannot undo a
--            consumption (credit_used_at set / claim 'consumed'); these RPCs release a reservation
--            AND revert a consumption tied to the SAME configuration, restoring eligibility.
--
-- (The §SMALL-6 exact-email fix is purely application-side — Supabase stores emails already
--  lower-cased at write time and the linking queries now use `.eq('email', …)` on a normalized
--  value — so no schema change is required. Documented here for traceability.)

-- =====================================================================
-- §HIGH-5  RELEASE-OR-REVERT BENEFIT RPCs (webhook cancellation)
-- ---------------------------------------------------------------------
-- Both are SECURITY DEFINER with a locked empty search_path and are service_role-only (webhook
-- code). Both are IDEMPOTENT and scoped to the CONFIGURATION that owns the benefit, so they can
-- never free a credit/claim now held by a DIFFERENT order.

-- Sample credit: release a reservation held by p_config_id AND undo a consumption performed by
-- p_config_id (paid-then-cancelled), making the €20 credit available again. Only ever touches a
-- row whose consumption/reservation was tied to THIS configuration.
create or replace function release_or_revert_sample_credit(p_sample_order_id uuid, p_config_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  update public.sample_orders
     set credit_used_at = null,
         credit_used_configuration_id = null,
         credit_reserved_config_id = null,
         credit_reservation_expires_at = null
   where id = p_sample_order_id
     and (credit_used_configuration_id = p_config_id or credit_reserved_config_id = p_config_id);
end $$;

-- First-order claim: delete the claim tied to THIS configuration whether it is 'reserved' or
-- 'consumed', restoring the customer's first-order eligibility. Never deletes a claim now owned by
-- a different config (a later order's consumption). Idempotent.
create or replace function release_or_revert_first_order(p_customer_id uuid, p_config_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  delete from public.first_order_claims
   where customer_id = p_customer_id
     and config_id = p_config_id
     and state in ('reserved','consumed');
end $$;

-- =====================================================================
-- §P0-1  OWNER-AWARE BENEFIT RELEASE (stale lease owner must not release the CURRENT owner's
--        reservation). A checkout that has LOST the lease (its token no longer matches the current
--        owner) must NEVER clear the benefit reservation now belonging to config_id — the new
--        owner may be using it. These release the reservation ONLY when p_token still matches the
--        configuration's current checkout_lock_token, taken under a row lock so a concurrent
--        reclaim can't interleave. A stale caller is a safe no-op; the reservation stays with the
--        current owner (or expires by its own TTL).
create or replace function release_sample_credit_if_owner(p_sample_order_id uuid, p_config_id uuid, p_token uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_token uuid;
begin
  select checkout_lock_token into v_token from public.configurations where id = p_config_id for update;
  if v_token is null or v_token <> p_token then
    return;   -- §P0-1 lease lost/reclaimed → stale caller must NOT release the reservation
  end if;
  update public.sample_orders
     set credit_reserved_config_id = null, credit_reservation_expires_at = null
   where id = p_sample_order_id
     and credit_reserved_config_id = p_config_id
     and credit_used_at is null;
end $$;

create or replace function release_first_order_if_owner(p_customer_id uuid, p_config_id uuid, p_token uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_token uuid;
begin
  select checkout_lock_token into v_token from public.configurations where id = p_config_id for update;
  if v_token is null or v_token <> p_token then
    return;   -- §P0-1 lease lost/reclaimed → stale caller must NOT release the reservation
  end if;
  delete from public.first_order_claims
   where customer_id = p_customer_id
     and config_id = p_config_id
     and state = 'reserved';
end $$;

-- =====================================================================
-- §P0  EXECUTE LOCKDOWN — service_role ONLY (mirrors 0015/0016)
-- ---------------------------------------------------------------------
do $$
declare
  sig text;
  sigs text[] := array[
    'release_or_revert_sample_credit(uuid, uuid)',
    'release_or_revert_first_order(uuid, uuid)',
    'release_sample_credit_if_owner(uuid, uuid, uuid)',
    'release_first_order_if_owner(uuid, uuid, uuid)'
  ];
begin
  foreach sig in array sigs loop
    execute format('revoke all on function public.%s from public', sig);
    begin execute format('revoke all on function public.%s from anon', sig); exception when undefined_object then null; end;
    begin execute format('revoke all on function public.%s from authenticated', sig); exception when undefined_object then null; end;
    begin execute format('grant execute on function public.%s to service_role', sig); exception when undefined_object then null; end;
  end loop;
end $$;
