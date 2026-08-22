-- 0026 — §OPTION-2 SHOPIFY WEBHOOK FAIL-CLOSED CLUSTER: reconciliation state + anomalies.
--
-- Adds the persistence needed to fail closed on a paid Shopify order whose actual amount or
-- currency does not match BUGO's authoritative stored value, WITHOUT auto-refunding.
--
-- 1) mark_webhook_event gains a terminal 'reconciled' status. A deterministic mismatch is
--    neither retryable-forever ('failed'→ endless redelivery) nor a clean success
--    ('completed'→ hides the anomaly). 'reconciled' is terminal: the anomaly is safely
--    recorded exactly once and Shopify redeliveries become idempotent duplicates.
--
-- 2) checkout_orphan_drafts is EXTENDED (not replaced) to also represent paid-order
--    amount/currency mismatches — it is already the admin-operable fail-closed surface with
--    source/reason/status. New nullable columns describe the mismatch; a 'kind' discriminator
--    separates orphan drafts from paid mismatches. Existing rows default to kind='orphan_draft'.
--
-- 3) record_paid_mismatch(...) inserts a mismatch anomaly idempotently keyed on the Shopify
--    order id, so a duplicate mismatch delivery does not create duplicate rows or re-mutate.
--
-- Sample historical price: sample_orders.amount_cents ALREADY persists the authoritative
-- checkout amount at creation (0013), so no snapshot column is required — verification uses it.
--
-- PRODUCTION: 0001–0020 applied; 0021–0025 not yet deployed. Additive + idempotent.

-- ---------------- 1. terminal 'reconciled' webhook status ----------------
-- §DEFECT-1 the REAL production table has 0015's inline CHECK (status in
-- ('processing','completed','failed')). mark_webhook_event below accepts 'reconciled', so the
-- existing CHECK must be upgraded deterministically or production rejects reconciled rows.
-- 0015 created the constraint inline (system-generated name), so find and drop it by definition,
-- then add a named constraint with the full allowed set. Idempotent.
do $$
declare v_conname text;
begin
  -- locate any CHECK constraint on shopify_webhook_events that constrains the status column to
  -- the old 3-value set (matched by definition, not a hardcoded name).
  select con.conname into v_conname
    from pg_constraint con
    join pg_class rel on rel.oid = con.conrelid
    join pg_namespace nsp on nsp.oid = rel.relnamespace
   where nsp.nspname = 'public' and rel.relname = 'shopify_webhook_events'
     and con.contype = 'c'
     and pg_get_constraintdef(con.oid) like '%status%'
     and pg_get_constraintdef(con.oid) not like '%reconciled%'
   limit 1;
  if v_conname is not null then
    execute format('alter table public.shopify_webhook_events drop constraint %I', v_conname);
  end if;
end $$;
alter table public.shopify_webhook_events drop constraint if exists shopify_webhook_events_status_check2;
alter table public.shopify_webhook_events
  add constraint shopify_webhook_events_status_check2
  check (status in ('processing','completed','failed','reconciled'));

create or replace function mark_webhook_event(p_topic text, p_order_id text, p_status text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if p_status not in ('processing','completed','failed','reconciled') then
    raise exception 'invalid webhook status %', p_status;
  end if;
  update public.shopify_webhook_events
     set status = p_status, updated_at = now(),
         locked_at = case when p_status = 'processing' then now() else locked_at end
   where topic = p_topic and shopify_order_id = p_order_id;
end $$;

-- claim_webhook_event treats 'reconciled' as terminal (like 'completed') so a redelivery of a
-- deterministically-mismatched order is acked as a duplicate and never reprocessed.
create or replace function claim_webhook_event(p_topic text, p_order_id text, p_lease_seconds int default 120)
returns text language plpgsql security definer set search_path = '' as $$
declare v_status text; v_locked timestamptz;
begin
  insert into public.shopify_webhook_events(topic, shopify_order_id, status, locked_at)
    values (p_topic, p_order_id, 'processing', now())
    on conflict (topic, shopify_order_id) do nothing;
  if found then
    return 'process';
  end if;

  select status, locked_at into v_status, v_locked
    from public.shopify_webhook_events
    where topic = p_topic and shopify_order_id = p_order_id
    for update;

  if v_status in ('completed','reconciled') then
    return 'duplicate';
  end if;
  if v_status = 'processing' and v_locked is not null
     and v_locked > now() - make_interval(secs => p_lease_seconds) then
    return 'locked';
  end if;

  update public.shopify_webhook_events
     set status = 'processing', locked_at = now(), updated_at = now()
   where topic = p_topic and shopify_order_id = p_order_id;
  return 'process';
end $$;

-- ---------------- 2. extend the reconciliation surface ----------------
alter table public.checkout_orphan_drafts
  add column if not exists kind text not null default 'orphan_draft'
    check (kind in ('orphan_draft','paid_mismatch'));
alter table public.checkout_orphan_drafts add column if not exists shopify_order_id text;
alter table public.checkout_orphan_drafts add column if not exists expected_amount_cents int;
alter table public.checkout_orphan_drafts add column if not exists actual_amount_cents int;
alter table public.checkout_orphan_drafts add column if not exists expected_currency text;
alter table public.checkout_orphan_drafts add column if not exists actual_currency text;
-- shopify_draft_order_id is NOT NULL on the original table; paid-mismatch rows have no draft id.
alter table public.checkout_orphan_drafts alter column shopify_draft_order_id drop not null;
-- one anomaly row per Shopify order for paid_mismatch (idempotent recording).
create unique index if not exists uq_orphan_paid_mismatch_order
  on public.checkout_orphan_drafts(shopify_order_id)
  where kind = 'paid_mismatch';

-- ---------------- 3. idempotent mismatch recorder ----------------
create or replace function record_paid_mismatch(
  p_source text, p_shopify_order_id text,
  p_config_id uuid, p_sample_order_id uuid,
  p_expected_amount_cents int, p_actual_amount_cents int,
  p_expected_currency text, p_actual_currency text,
  p_reason text
) returns void language plpgsql security definer set search_path = '' as $$
begin
  insert into public.checkout_orphan_drafts(
    kind, source, shopify_draft_order_id, shopify_order_id,
    config_id, sample_order_id,
    expected_amount_cents, actual_amount_cents, expected_currency, actual_currency,
    reason, status)
  values (
    'paid_mismatch', p_source, null, p_shopify_order_id,
    p_config_id, p_sample_order_id,
    p_expected_amount_cents, p_actual_amount_cents, p_expected_currency, p_actual_currency,
    p_reason, 'open')
  on conflict (shopify_order_id) where kind = 'paid_mismatch' do nothing;
end $$;

-- service-role only (no anon/authenticated execute); admins read via existing table policies.
revoke all on function record_paid_mismatch(text,text,uuid,uuid,int,int,text,text,text) from public;
do $$ begin execute 'revoke all on function record_paid_mismatch(text,text,uuid,uuid,int,int,text,text,text) from anon'; exception when undefined_object then null; end $$;
do $$ begin execute 'revoke all on function record_paid_mismatch(text,text,uuid,uuid,int,int,text,text,text) from authenticated'; exception when undefined_object then null; end $$;
-- §DEFECT-1 service_role calls this via the service client after PUBLIC execute is revoked, so it
-- needs its own explicit grant (matching the 0016/0023 hardened pattern).
grant execute on function record_paid_mismatch(text,text,uuid,uuid,int,int,text,text,text) to service_role;

-- §DEFECT-1 CREATE OR REPLACE above reset grants on the webhook event fns to Postgres defaults
-- (EXECUTE to PUBLIC). Re-assert the intended hardened grants: service-role only.
revoke all on function mark_webhook_event(text,text,text) from public;
revoke all on function claim_webhook_event(text,text,int) from public;
do $$ begin execute 'revoke all on function mark_webhook_event(text,text,text) from anon'; exception when undefined_object then null; end $$;
do $$ begin execute 'revoke all on function mark_webhook_event(text,text,text) from authenticated'; exception when undefined_object then null; end $$;
do $$ begin execute 'revoke all on function claim_webhook_event(text,text,int) from anon'; exception when undefined_object then null; end $$;
do $$ begin execute 'revoke all on function claim_webhook_event(text,text,int) from authenticated'; exception when undefined_object then null; end $$;
grant execute on function mark_webhook_event(text,text,text) to service_role;
grant execute on function claim_webhook_event(text,text,int) to service_role;

-- ---------------- 4. atomic, cross-topic-safe order-event application (§DEFECT-2/3) ----------------
-- The previous split guard_order_event()/record_order_event() was NOT atomic: the FOR UPDATE lock
-- released when guard returned, so an older paid and a newer cancelled (different (topic,order_id)
-- leases → concurrent) could both read 'apply' and interleave, letting the older paid resurrect a
-- newer cancellation. These RPCs instead do the ordering decision AND all payment-critical state
-- mutation inside ONE transaction under a single per-shopify_order_id lock, shared across paid and
-- cancelled. A stale worker can never mutate payment_state / configurations.status / benefits /
-- last_event_at after a newer event has won.
--
-- Per-order serialization uses pg_advisory_xact_lock(hashtextextended(shopify_order_id)): all
-- events for the same Shopify order serialize on the same lock regardless of topic; the lock is
-- held to transaction end, i.e. across the entire decision+mutation.
alter table public.orders add column if not exists last_event_at timestamptz;
alter table public.orders add column if not exists last_event_state text;

-- Monotonic decision (cancellation wins ties). Returns true if the incoming event is authoritative.
create or replace function public._order_event_wins(
  p_incoming_state text, p_event_at timestamptz, p_last_at timestamptz, p_last_state text
) returns boolean language sql immutable set search_path = '' as $$
  select case
    when p_last_at is null then true
    when p_event_at > p_last_at then true
    when p_event_at < p_last_at then false
    -- equal timestamps: cancelled beats a non-cancelled recorded state; otherwise loses.
    when p_incoming_state = 'cancelled' and p_last_state is distinct from 'cancelled' then true
    else false
  end
$$;

-- MAIN order: atomically decide + apply payment_state, configuration status, and first-order /
-- sample-credit benefit consume/revert. Returns 'applied' or 'stale'.
--   p_incoming_state : 'paid' | 'cancelled' | 'pending' | 'reconciliation_hold'
--   p_apply_paid     : true only when a verified, non-cancelled paid main order should take effect
--   p_is_cancelled   : true on a cancellation delivery (drives release/revert)
create or replace function apply_main_order_event(
  p_shopify_order_id text,
  p_event_at timestamptz,
  p_incoming_state text,
  p_apply_paid boolean,
  p_is_cancelled boolean,
  p_config_id uuid,
  p_customer_id uuid,
  p_benefit_type text,
  p_sample_order_id uuid
) returns text language plpgsql security definer set search_path = '' as $$
declare v_last_at timestamptz; v_last_state text;
begin
  if p_event_at is null then
    raise exception 'apply_main_order_event: authoritative event timestamp required'
      using errcode = 'check_violation';
  end if;
  -- serialize ALL events for this Shopify order (paid + cancelled) on one lock, held to commit.
  perform pg_advisory_xact_lock(hashtextextended(p_shopify_order_id, 0));

  select last_event_at, last_event_state into v_last_at, v_last_state
    from public.orders where shopify_order_id = p_shopify_order_id for update;

  if not public._order_event_wins(p_incoming_state, p_event_at, v_last_at, v_last_state) then
    return 'stale';
  end if;

  -- Winning event: record ordering + payment_state atomically.
  update public.orders
     set payment_state = p_incoming_state, last_event_at = p_event_at, last_event_state = p_incoming_state
   where shopify_order_id = p_shopify_order_id;

  -- Configuration transition + benefit consume ONLY on a verified paid, non-cancelled event.
  if p_apply_paid and not p_is_cancelled and p_config_id is not null then
    update public.configurations set status = 'ordered' where id = p_config_id;
    if p_benefit_type = 'sample_credit' and p_sample_order_id is not null then
      update public.sample_orders
         set credit_used_at = now(), credit_used_configuration_id = p_config_id,
             credit_reserved_config_id = null, credit_reservation_expires_at = null
       where id = p_sample_order_id and credit_used_at is null;
    elsif p_benefit_type = 'first_order_5pct' and p_customer_id is not null then
      perform public.consume_first_order(p_customer_id, p_config_id);
    end if;
  end if;

  -- Cancellation: release/revert benefit for THIS configuration (scoped), idempotent.
  if p_is_cancelled and p_config_id is not null then
    if p_benefit_type = 'sample_credit' and p_sample_order_id is not null then
      perform public.release_or_revert_sample_credit(p_sample_order_id, p_config_id);
    elsif p_benefit_type = 'first_order_5pct' and p_customer_id is not null then
      perform public.release_or_revert_first_order(p_customer_id, p_config_id);
    end if;
  end if;

  return 'applied';
end $$;

-- SAMPLE order: atomically decide + apply sample_orders.payment_state AND the orders mirror
-- payment_state under the same per-order lock, so a stale older paid cannot resurrect a newer
-- cancellation on EITHER row. p_mirror_paid_state is the value to write to orders.payment_state
-- when this event wins (e.g. 'paid'|'cancelled'|'pending'|'reconciliation_hold'). The mirror row
-- must already exist (route upserts it without payment_state before calling). Returns 'applied'
-- or 'stale'.
create or replace function apply_sample_order_event(
  p_shopify_order_id text,
  p_event_at timestamptz,
  p_sample_order_id uuid,
  p_incoming_state text,
  p_mirror_paid_state text
) returns text language plpgsql security definer set search_path = '' as $$
declare v_last_at timestamptz; v_last_state text;
begin
  if p_event_at is null then
    raise exception 'apply_sample_order_event: authoritative event timestamp required'
      using errcode = 'check_violation';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(p_shopify_order_id, 0));

  -- ordering is tracked on sample_orders' own last_event_* columns.
  select last_event_at, last_event_state into v_last_at, v_last_state
    from public.sample_orders where id = p_sample_order_id for update;

  if not public._order_event_wins(p_incoming_state, p_event_at, v_last_at, v_last_state) then
    return 'stale';
  end if;

  update public.sample_orders
     set payment_state = p_incoming_state, shopify_order_id = p_shopify_order_id,
         last_event_at = p_event_at, last_event_state = p_incoming_state
   where id = p_sample_order_id;

  -- Mirror orders row: authoritative payment_state + ordering written in the SAME transaction,
  -- so no post-RPC route write can leave orders.payment_state='paid' after a newer cancellation.
  update public.orders
     set payment_state = p_mirror_paid_state, last_event_at = p_event_at, last_event_state = p_incoming_state
   where shopify_order_id = p_shopify_order_id;
  return 'applied';
end $$;

alter table public.sample_orders add column if not exists last_event_at timestamptz;
alter table public.sample_orders add column if not exists last_event_state text;

revoke all on function public._order_event_wins(text,timestamptz,timestamptz,text) from public;
revoke all on function apply_main_order_event(text,timestamptz,text,boolean,boolean,uuid,uuid,text,uuid) from public;
revoke all on function apply_sample_order_event(text,timestamptz,uuid,text,text) from public;
do $$ begin execute 'revoke all on function apply_main_order_event(text,timestamptz,text,boolean,boolean,uuid,uuid,text,uuid) from anon'; exception when undefined_object then null; end $$;
do $$ begin execute 'revoke all on function apply_main_order_event(text,timestamptz,text,boolean,boolean,uuid,uuid,text,uuid) from authenticated'; exception when undefined_object then null; end $$;
do $$ begin execute 'revoke all on function apply_sample_order_event(text,timestamptz,uuid,text,text) from anon'; exception when undefined_object then null; end $$;
do $$ begin execute 'revoke all on function apply_sample_order_event(text,timestamptz,uuid,text,text) from authenticated'; exception when undefined_object then null; end $$;
grant execute on function apply_main_order_event(text,timestamptz,text,boolean,boolean,uuid,uuid,text,uuid) to service_role;
grant execute on function apply_sample_order_event(text,timestamptz,uuid,text,text) to service_role;
