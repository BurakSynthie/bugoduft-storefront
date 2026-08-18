-- Phase 6E-B2 completion pass — paid Duftmuster-Set, €20 sample credit, 5% first-order
-- benefit, non-stacking. ADDITIVE ONLY. Does NOT touch 0001-0012. No drops, no destructive
-- reseed. Preserves the free 5k sample (free_sample_source='free_5k', from 0010) untouched.

-- ---------------- paid sample purchases (Duftmuster-Set, 40 Düfte, €40) ----------------
-- One row per purchase attempt. `payment_state` starts 'pending' at Draft Order creation
-- and is flipped to 'paid' only by the Shopify webhook once Shopify confirms payment —
-- never by the client. The resulting €20 credit is usable at most once, tracked here.
create table if not exists sample_orders (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid references auth.users(id) on delete set null,
  customer_id uuid references customers(id) on delete set null,
  email text,
  locale locale not null default 'de',
  amount_cents int not null default 4000 check (amount_cents >= 0),
  currency text not null default 'EUR',
  credit_cents int not null default 2000 check (credit_cents >= 0),
  shopify_draft_order_id text,
  shopify_order_id text unique,
  payment_state text not null default 'pending' check (payment_state in ('pending','paid','cancelled')),
  credit_used_at timestamptz,
  credit_used_configuration_id uuid,   -- FK added below, after `configurations` gains its column
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger t_sample_orders_u before update on sample_orders for each row execute function set_updated_at();
create index if not exists idx_sample_orders_auth_user on sample_orders(auth_user_id);
create index if not exists idx_sample_orders_shopify_order on sample_orders(shopify_order_id);

alter table sample_orders enable row level security;
drop policy if exists customer_read_own_sample_orders on sample_orders;
create policy customer_read_own_sample_orders on sample_orders for select using (auth_user_id = auth.uid());
drop policy if exists admin_all_sample_orders on sample_orders;
create policy admin_all_sample_orders on sample_orders for all using (is_admin()) with check (is_admin());
-- No anon/customer insert or update policy: sample_orders rows are created and updated
-- only by the server-side service-role checkout/webhook code, matching `configurations`.

-- ---------------- benefit fields on configurations (same pattern as 0010's free-sample
-- flags: additive, nullable/defaulted, never breaks existing rows) ----------------
alter table configurations add column if not exists auth_user_id uuid references auth.users(id) on delete set null;
alter table configurations add column if not exists savings_cents int not null default 0 check (savings_cents >= 0);
alter table configurations add column if not exists pre_benefit_total_cents int;
alter table configurations add column if not exists benefit_type text check (benefit_type in ('sample_credit','first_order_5pct'));
alter table configurations add column if not exists benefit_amount_cents int not null default 0 check (benefit_amount_cents >= 0);
alter table configurations add column if not exists sample_order_id uuid references sample_orders(id) on delete set null;

do $$ begin
  alter table sample_orders add constraint sample_orders_credit_used_configuration_id_fkey
    foreign key (credit_used_configuration_id) references configurations(id) on delete set null;
exception when duplicate_object then null; end $$;

-- ---------------- distinguish paid-sample orders from main-product orders ----------------
alter table orders add column if not exists order_kind text not null default 'main' check (order_kind in ('main','sample'));
alter table orders add column if not exists sample_order_id uuid references sample_orders(id) on delete set null;
create index if not exists idx_orders_order_kind on orders(order_kind);
