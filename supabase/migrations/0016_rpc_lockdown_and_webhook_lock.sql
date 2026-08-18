-- BUGO DUFT — Release-candidate hardening. ADDITIVE ONLY.
-- Does NOT modify 0001–0015. Every statement is idempotent / re-runnable. Covers:
--   §P0  SECURITY DEFINER RPC lockdown (service_role only; revoke public/anon/authenticated)
--   §P0  hardened search_path (= '') + schema-qualified bodies for the commerce RPCs
--   §P0  atomic webhook processing lease (claim_webhook_event) to replace the
--        non-atomic read-then-update in the orders webhook
--
-- These commerce RPCs mutate money-equivalent state (sample credit, first-order benefit).
-- They must ONLY ever run from service-role server code — never be reachable through the
-- public PostgREST Data API. We (a) recreate them with a hardened, empty search_path and
-- fully schema-qualified identifiers, then (b) revoke EXECUTE from PUBLIC/anon/authenticated
-- and grant it to service_role only.

-- =====================================================================
-- §P0  WEBHOOK PROCESSING LEASE
-- ---------------------------------------------------------------------
-- Adds a lease timestamp and an ATOMIC claim function. The previous handler did a
-- read-then-update after a duplicate-key insert, which allowed two deliveries of the
-- same event to be processed concurrently. claim_webhook_event() performs the whole
-- decision under a single row lock and returns exactly one verdict:
--   'process'   -> caller owns a fresh/reclaimed lease and must process
--   'duplicate' -> already completed; skip
--   'locked'    -> another worker holds a still-valid lease; do nothing
alter table shopify_webhook_events add column if not exists locked_at timestamptz;

create or replace function claim_webhook_event(p_topic text, p_order_id text, p_lease_seconds int default 120)
returns text language plpgsql security definer set search_path = '' as $$
declare v_status text; v_locked timestamptz;
begin
  -- Try to take ownership by inserting a fresh 'processing' row.
  insert into public.shopify_webhook_events(topic, shopify_order_id, status, locked_at)
    values (p_topic, p_order_id, 'processing', now())
    on conflict (topic, shopify_order_id) do nothing;
  if found then
    return 'process';                                   -- fresh insert; we own it
  end if;

  -- Existing row: lock it and decide.
  select status, locked_at into v_status, v_locked
    from public.shopify_webhook_events
    where topic = p_topic and shopify_order_id = p_order_id
    for update;

  if v_status = 'completed' then
    return 'duplicate';
  end if;
  if v_status = 'processing' and v_locked is not null
     and v_locked > now() - make_interval(secs => p_lease_seconds) then
    return 'locked';                                     -- another worker holds a fresh lease
  end if;

  -- 'failed', or a stale 'processing' lease → reclaim.
  update public.shopify_webhook_events
     set status = 'processing', locked_at = now(), updated_at = now()
   where topic = p_topic and shopify_order_id = p_order_id;
  return 'process';
end $$;

-- Mark an event's terminal state from service-role code (idempotent, atomic).
create or replace function mark_webhook_event(p_topic text, p_order_id text, p_status text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if p_status not in ('processing','completed','failed') then
    raise exception 'invalid webhook status %', p_status;
  end if;
  update public.shopify_webhook_events
     set status = p_status, updated_at = now(),
         locked_at = case when p_status = 'processing' then now() else locked_at end
   where topic = p_topic and shopify_order_id = p_order_id;
end $$;

-- =====================================================================
-- §P0  RECREATE COMMERCE RPCs WITH HARDENED search_path = ''
-- ---------------------------------------------------------------------
-- Identical logic to 0015, but with an empty search_path and public.-qualified tables so
-- the functions can't be hijacked via a mutable search_path. create-or-replace is additive.

create or replace function reserve_sample_credit(p_sample_order_id uuid, p_config_id uuid, p_ttl_minutes int)
returns boolean language plpgsql security definer set search_path = '' as $$
declare v_rows int;
begin
  update public.sample_orders
     set credit_reserved_config_id = p_config_id,
         credit_reservation_expires_at = now() + ((p_ttl_minutes)::text || ' minutes')::interval
   where id = p_sample_order_id
     and payment_state = 'paid'
     and credit_used_at is null
     and ( credit_reserved_config_id is null
        or credit_reserved_config_id = p_config_id
        or credit_reservation_expires_at is null
        or credit_reservation_expires_at < now() );
  get diagnostics v_rows = row_count;
  return v_rows > 0;
end $$;

create or replace function release_sample_credit(p_sample_order_id uuid, p_config_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  update public.sample_orders
     set credit_reserved_config_id = null, credit_reservation_expires_at = null
   where id = p_sample_order_id
     and credit_reserved_config_id = p_config_id
     and credit_used_at is null;
end $$;

create or replace function reserve_first_order(p_customer_id uuid, p_config_id uuid, p_ttl_minutes int)
returns boolean language plpgsql security definer set search_path = '' as $$
declare v_state text; v_exp timestamptz; v_cfg uuid;
begin
  select state, expires_at, config_id into v_state, v_exp, v_cfg
    from public.first_order_claims where customer_id = p_customer_id for update;
  if not found then
    begin
      insert into public.first_order_claims(customer_id, config_id, state, expires_at)
        values (p_customer_id, p_config_id, 'reserved', now() + ((p_ttl_minutes)::text || ' minutes')::interval);
      return true;
    exception when unique_violation then
      select state, expires_at, config_id into v_state, v_exp, v_cfg
        from public.first_order_claims where customer_id = p_customer_id for update;
    end;
  end if;
  if v_state = 'consumed' then return false; end if;
  if v_cfg = p_config_id or v_exp is null or v_exp < now() then
    update public.first_order_claims
       set config_id = p_config_id, state = 'reserved',
           expires_at = now() + ((p_ttl_minutes)::text || ' minutes')::interval
     where customer_id = p_customer_id;
    return true;
  end if;
  return false;
end $$;

create or replace function release_first_order(p_customer_id uuid, p_config_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  delete from public.first_order_claims
   where customer_id = p_customer_id and config_id = p_config_id and state = 'reserved';
end $$;

create or replace function consume_first_order(p_customer_id uuid, p_config_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  insert into public.first_order_claims(customer_id, config_id, state, expires_at)
    values (p_customer_id, p_config_id, 'consumed', null)
  on conflict (customer_id) do update
    set state = 'consumed', config_id = excluded.config_id, expires_at = null;
end $$;

-- =====================================================================
-- §P0  EXECUTE LOCKDOWN — service_role ONLY
-- ---------------------------------------------------------------------
-- Revoke the default PUBLIC execute grant (and anon/authenticated explicitly) so these
-- benefit/webhook RPCs are NOT exposed through the public Data API, then grant to the
-- service role used by our trusted server code.
do $$
declare
  sig text;
  sigs text[] := array[
    'reserve_sample_credit(uuid, uuid, integer)',
    'release_sample_credit(uuid, uuid)',
    'reserve_first_order(uuid, uuid, integer)',
    'release_first_order(uuid, uuid)',
    'consume_first_order(uuid, uuid)',
    'claim_webhook_event(text, text, integer)',
    'mark_webhook_event(text, text, text)'
  ];
begin
  foreach sig in array sigs loop
    execute format('revoke all on function public.%s from public', sig);
    -- anon / authenticated may not exist in a bare Postgres; ignore if so.
    begin execute format('revoke all on function public.%s from anon', sig); exception when undefined_object then null; end;
    begin execute format('revoke all on function public.%s from authenticated', sig); exception when undefined_object then null; end;
    begin execute format('grant execute on function public.%s to service_role', sig); exception when undefined_object then null; end;
  end loop;
end $$;
