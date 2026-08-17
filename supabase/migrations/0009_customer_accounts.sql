-- Phase 6E-A — customer self-service. ADDITIVE. Does NOT touch 0005–0008.
-- No drops, no reseed. Customers may read only their OWN rows via auth.uid();
-- admin policies (is_admin) remain intact and unchanged. Guest orders (customer_id
-- null) stay valid and are simply never exposed to any customer.

-- ---------------- approval state on orders (backward compatible) ----------------
-- design_approved_at already exists (0004). Add an explicit state + note + actor so
-- admins can record "customer approved via WhatsApp/email" and the storefront can
-- show a clear approval stage. Existing rows default to 'pending'.
do $$ begin
  create type approval_state as enum ('pending','approved','revision');
exception when duplicate_object then null; end $$;
alter table orders add column if not exists approval_state approval_state not null default 'pending';
alter table orders add column if not exists approval_note text;
alter table orders add column if not exists approved_by uuid references auth.users(id) on delete set null;

-- ---------------- customer self-read RLS on existing private tables ----------------
-- (These tables were admin-only; add narrow self-access keyed to auth.uid().)
drop policy if exists customer_self_read on customers;
create policy customer_self_read on customers for select using (auth_user_id = auth.uid());
drop policy if exists customer_self_insert on customers;
create policy customer_self_insert on customers for insert with check (auth_user_id = auth.uid());
drop policy if exists customer_self_update on customers;
create policy customer_self_update on customers for update using (auth_user_id = auth.uid()) with check (auth_user_id = auth.uid());

drop policy if exists customer_read_own_orders on orders;
create policy customer_read_own_orders on orders for select
  using (customer_id in (select id from customers where auth_user_id = auth.uid()));

drop policy if exists customer_read_own_order_items on order_items;
create policy customer_read_own_order_items on order_items for select
  using (order_id in (select o.id from orders o join customers c on c.id = o.customer_id
                      where c.auth_user_id = auth.uid()));

-- ---------------- saved configurations (account-linked drafts) ----------------
create table if not exists saved_configurations (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid not null references auth.users(id) on delete cascade,
  label text,
  product_code text,
  collection_code text,
  locale locale not null default 'de',
  draft jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_saved_cfg_user on saved_configurations(auth_user_id);
alter table saved_configurations enable row level security;

drop policy if exists saved_cfg_owner_all on saved_configurations;
create policy saved_cfg_owner_all on saved_configurations for all
  using (auth_user_id = auth.uid()) with check (auth_user_id = auth.uid());
