-- BUGO DUFT — Phase 5: admin auth, order operations, 0001 numbering, audit.
-- Forward migration for the already-created database. Money = integer cents.

-- ---------------- admin users + is_admin() ----------------
do $$ begin create type admin_role as enum ('sahip','grafik','operasyon','muhasebe','icerik');
exception when duplicate_object then null; end $$;

create table if not exists admin_users (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  role admin_role not null default 'sahip',
  created_at timestamptz not null default now()
);
alter table admin_users enable row level security;

create or replace function is_admin() returns boolean
  language sql stable security definer set search_path = public as $$
  select exists (select 1 from admin_users where id = auth.uid());
$$;

drop policy if exists admin_read_self on admin_users;
create policy admin_read_self on admin_users for select using (id = auth.uid() or is_admin());

-- ---------------- concurrency-safe BUGO order number (0001, 0002, ...) ----------------
create sequence if not exists bugo_order_seq start with 1 increment by 1;
create or replace function next_bugo_order_number() returns text
  language sql volatile as $$ select lpad(nextval('bugo_order_seq')::text, 4, '0'); $$;

-- ---------------- extend orders with operational fields ----------------
do $$ begin create type order_op_status as enum ('received','design','production','shipped');
exception when duplicate_object then null; end $$;

alter table orders add column if not exists bugo_number text unique;
alter table orders add column if not exists configuration_id uuid references configurations(id) on delete set null;
alter table orders add column if not exists shopify_order_id text unique;
alter table orders add column if not exists shopify_order_name text;
alter table orders add column if not exists customer_email text;
alter table orders add column if not exists customer_first_name text;
alter table orders add column if not exists customer_last_name text;
alter table orders add column if not exists company text;
alter table orders add column if not exists phone text;
alter table orders add column if not exists billing_address jsonb;
alter table orders add column if not exists shipping_address jsonb;
alter table orders add column if not exists total_paid_cents int check (total_paid_cents is null or total_paid_cents >= 0);
alter table orders add column if not exists payment_state text;
alter table orders add column if not exists op_status order_op_status not null default 'received';
alter table orders add column if not exists carrier text;
alter table orders add column if not exists tracking_number text;
alter table orders add column if not exists shipped_at timestamptz;
alter table orders add column if not exists design_approved_at timestamptz;
alter table orders add column if not exists admin_notes text;
create index if not exists idx_orders_op_status on orders(op_status);
create index if not exists idx_orders_created on orders(created_at desc);

-- assign a BUGO number on insert if not provided (sequence => concurrency-safe, no collisions)
create or replace function assign_bugo_number() returns trigger language plpgsql as $$
begin if new.bugo_number is null then new.bugo_number := next_bugo_order_number(); end if; return new; end $$;
drop trigger if exists t_orders_bugo_number on orders;
create trigger t_orders_bugo_number before insert on orders for each row execute function assign_bugo_number();

-- ---------------- audit log ----------------
create table if not exists order_audit (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders(id) on delete cascade,
  actor_email text,
  field text not null,
  old_value text,
  new_value text,
  created_at timestamptz not null default now()
);
create index if not exists idx_order_audit_order on order_audit(order_id);
alter table order_audit enable row level security;

-- ---------------- webhook idempotency log ----------------
create table if not exists shopify_webhook_events (
  id uuid primary key default gen_random_uuid(),
  topic text not null,
  shopify_order_id text not null,
  received_at timestamptz not null default now(),
  unique (topic, shopify_order_id)
);
alter table shopify_webhook_events enable row level security;   -- no policies: service-role only

-- ---------------- RLS: admins only (storefront/anon can never read these) ----------------
drop policy if exists admin_all_orders on orders;
create policy admin_all_orders on orders for all using (is_admin()) with check (is_admin());
drop policy if exists admin_read_configurations on configurations;
create policy admin_read_configurations on configurations for select using (is_admin());
drop policy if exists admin_all_audit on order_audit;
create policy admin_all_audit on order_audit for all using (is_admin()) with check (is_admin());
drop policy if exists admin_read_customers on customers;
create policy admin_read_customers on customers for select using (is_admin());
