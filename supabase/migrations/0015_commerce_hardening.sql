-- BUGO DUFT — Phase 6E FINAL commerce hardening. ADDITIVE ONLY.
-- Does NOT touch 0001-0014. No drops, no destructive reseed. Every statement is
-- idempotent / re-runnable. Covers:
--   §P0-3  atomic benefit reservation (paid €20 sample credit + first-order 5%)
--   §P0-5  webhook idempotency status model (processing/completed/failed)
--   §P0-4  (supported by data model below; eligibility rule lives in app code)
--   §P1    fragrance commercial-group field, separate from the scent-profile `category`
--
-- set_updated_at() already exists (created in an earlier migration, used by 0013's
-- t_sample_orders_u trigger) — reused here, never redefined.

-- =====================================================================
-- §P0-5  WEBHOOK IDEMPOTENCY: processing / completed / failed
-- ---------------------------------------------------------------------
-- Before this pass a webhook row was inserted BEFORE order processing, so a failure
-- after the insert made every Shopify retry look like a duplicate and the order could
-- be lost. The status column lets the handler claim a row as 'processing', mark it
-- 'completed' only after all required DB writes succeed, and mark it 'failed' (retryable)
-- otherwise. Rows that predate this column are back-filled as 'completed' (default).
alter table shopify_webhook_events add column if not exists status text not null default 'completed'
  check (status in ('processing','completed','failed'));
alter table shopify_webhook_events add column if not exists updated_at timestamptz not null default now();

do $$ begin
  create trigger t_webhook_events_u before update on shopify_webhook_events
    for each row execute function set_updated_at();
exception when duplicate_object then null; end $$;

-- =====================================================================
-- §P0-3  ATOMIC PAID-SAMPLE (€20) CREDIT RESERVATION
-- ---------------------------------------------------------------------
-- credit_used_at (from 0013) = FINAL, single-use consumption, set only on confirmed
-- payment. The columns below add a short-lived, atomic RESERVATION so two concurrent
-- checkout tabs/draft orders can never both price against the same credit. An expired
-- reservation (past credit_reservation_expires_at) is automatically re-claimable.
alter table sample_orders add column if not exists credit_reserved_config_id uuid
  references configurations(id) on delete set null;
alter table sample_orders add column if not exists credit_reservation_expires_at timestamptz;

-- Atomic reserve: a single UPDATE ... WHERE is evaluated under row lock, so a second
-- concurrent caller blocks, then re-tests the WHERE against the just-reserved row and
-- gets 0 rows. Returns true only if THIS caller now holds the reservation.
create or replace function reserve_sample_credit(p_sample_order_id uuid, p_config_id uuid, p_ttl_minutes int)
returns boolean language plpgsql security definer set search_path = public as $$
declare v_rows int;
begin
  update sample_orders
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

-- Release a reservation held by a specific configuration (checkout aborted / total
-- mismatch). Never touches an already-consumed credit, and never a reservation now held
-- by a different config.
create or replace function release_sample_credit(p_sample_order_id uuid, p_config_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  update sample_orders
     set credit_reserved_config_id = null, credit_reservation_expires_at = null
   where id = p_sample_order_id
     and credit_reserved_config_id = p_config_id
     and credit_used_at is null;
end $$;

-- =====================================================================
-- §P0-3 / §P0-4  ATOMIC FIRST-ORDER (5%) CLAIM
-- ---------------------------------------------------------------------
-- One customer may hold at most one active first-order benefit claim (primary key on
-- customer_id). 'reserved' = held by an in-flight checkout (with expiry); 'consumed' =
-- a real paid main order used it. Combined with the paid-order eligibility check in app
-- code (orders.payment_state='paid', order_kind='main'), an abandoned/unpaid attempt can
-- never permanently consume the benefit.
create table if not exists first_order_claims (
  customer_id uuid primary key references customers(id) on delete cascade,
  config_id   uuid references configurations(id) on delete set null,
  state       text not null default 'reserved' check (state in ('reserved','consumed')),
  expires_at  timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
do $$ begin
  create trigger t_first_order_claims_u before update on first_order_claims
    for each row execute function set_updated_at();
exception when duplicate_object then null; end $$;

alter table first_order_claims enable row level security;
drop policy if exists admin_all_first_order_claims on first_order_claims;
create policy admin_all_first_order_claims on first_order_claims for all using (is_admin()) with check (is_admin());
-- no anon/customer policy: written only by the service-role checkout/webhook code.

-- Atomically reserve the first-order benefit for a customer. Returns true iff THIS
-- config now holds a valid reservation. Takes over only an expired reservation or its own.
create or replace function reserve_first_order(p_customer_id uuid, p_config_id uuid, p_ttl_minutes int)
returns boolean language plpgsql security definer set search_path = public as $$
declare v_state text; v_exp timestamptz; v_cfg uuid;
begin
  select state, expires_at, config_id into v_state, v_exp, v_cfg
    from first_order_claims where customer_id = p_customer_id for update;
  if not found then
    begin
      insert into first_order_claims(customer_id, config_id, state, expires_at)
        values (p_customer_id, p_config_id, 'reserved', now() + ((p_ttl_minutes)::text || ' minutes')::interval);
      return true;
    exception when unique_violation then
      -- a concurrent insert won the race; fall through to the locked re-read
      select state, expires_at, config_id into v_state, v_exp, v_cfg
        from first_order_claims where customer_id = p_customer_id for update;
    end;
  end if;
  if v_state = 'consumed' then return false; end if;                 -- already used
  if v_cfg = p_config_id or v_exp is null or v_exp < now() then       -- own or expired
    update first_order_claims
       set config_id = p_config_id, state = 'reserved',
           expires_at = now() + ((p_ttl_minutes)::text || ' minutes')::interval
     where customer_id = p_customer_id;
    return true;
  end if;
  return false;                                                       -- another active hold
end $$;

create or replace function release_first_order(p_customer_id uuid, p_config_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  delete from first_order_claims
   where customer_id = p_customer_id and config_id = p_config_id and state = 'reserved';
end $$;

-- Finalize on confirmed payment: mark the customer's claim consumed (idempotent).
create or replace function consume_first_order(p_customer_id uuid, p_config_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  insert into first_order_claims(customer_id, config_id, state, expires_at)
    values (p_customer_id, p_config_id, 'consumed', null)
  on conflict (customer_id) do update
    set state = 'consumed', config_id = excluded.config_id, expires_at = null;
end $$;

-- =====================================================================
-- §P1  FRAGRANCE COMMERCIAL GROUP  (STANDARD 20 / PARFUM 10 / VIP 10)
-- ---------------------------------------------------------------------
-- SEPARATE from the existing scent-profile `category` (frisch/fruchtig/suess/elegant/
-- intensiv), which is preserved untouched. catalog_group is the commercial catalogue
-- grouping, admin-managed via Admin -> Kokular. Back-filled from the code prefixes that
-- 0012 introduced; 0002 seed scents (no prefix) stay null and can be assigned in admin.
--
-- NOTE (deliberate): this column does NOT restrict which products may use which scents.
-- Product availability stays explicit in product_scents (admin-manageable) — the group is
-- descriptive metadata only, per the hardening brief.
alter table scents add column if not exists catalog_group text
  check (catalog_group is null or catalog_group in ('standard','parfum','vip'));
update scents set catalog_group = 'standard' where catalog_group is null and code like 'std-%';
update scents set catalog_group = 'parfum'   where catalog_group is null and code like 'prf-%';
update scents set catalog_group = 'vip'      where catalog_group is null and code like 'vip-%';
create index if not exists idx_scents_catalog_group on scents(catalog_group);
