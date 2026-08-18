-- BUGO DUFT — Phase 3A schema. Money = integer cents. Locales = de|en|fr.
create extension if not exists pgcrypto;

-- locale enum
do $$ begin
  create type locale as enum ('de','en','fr');
exception when duplicate_object then null; end $$;

-- updated_at helper
create or replace function set_updated_at() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

-- ---------------- SITE / BUSINESS SETTINGS (single row) ----------------
create table if not exists site_settings (
  id boolean primary key default true check (id),           -- enforces one row
  default_currency text not null default 'EUR',
  source_locale locale not null default 'de',
  supported_locales locale[] not null default '{de,en,fr}',
  admin_notification_email text not null default 'bugoduft@gmail.com',
  whatsapp_number text,
  whatsapp_default_message text,
  qty_min int not null default 1000 check (qty_min > 0),
  qty_step int not null default 1000 check (qty_step > 0),
  qty_max int not null default 100000 check (qty_max >= qty_min),
  cord_color text not null default 'black',
  updated_at timestamptz not null default now()
);
create trigger t_site_settings_u before update on site_settings for each row execute function set_updated_at();

-- ---------------- COLLECTIONS ----------------
create table if not exists collections (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,                                 -- STANDARD|PREMIUM|DELUXE|VIP
  group_id text not null unique,
  is_active boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger t_collections_u before update on collections for each row execute function set_updated_at();

create table if not exists collection_translations (
  id uuid primary key default gen_random_uuid(),
  collection_id uuid not null references collections(id) on delete cascade,
  locale locale not null,
  name text not null,
  slug text not null,
  description text,
  seo_title text, seo_description text,
  unique (collection_id, locale),
  unique (locale, slug)
);

-- ---------------- PRODUCTS ----------------
create table if not exists products (
  id uuid primary key default gen_random_uuid(),
  product_code text not null unique,
  collection_id uuid not null references collections(id) on delete restrict,
  group_id text not null unique,
  is_active boolean not null default true,
  base_price_cents int not null check (base_price_cents >= 0),
  currency text not null default 'EUR',
  min_qty int not null default 1000 check (min_qty > 0),
  max_qty int not null default 100000 check (max_qty >= min_qty),
  qty_step int not null default 1000 check (qty_step > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger t_products_u before update on products for each row execute function set_updated_at();
create index if not exists idx_products_collection on products(collection_id);

create table if not exists product_translations (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references products(id) on delete cascade,
  locale locale not null,
  name text not null,
  slug text not null,
  h1 text,
  short_desc text,
  long_desc text,
  seo_title text, seo_description text,
  unique (product_id, locale),
  unique (locale, slug)
);

-- volume tiers (only the base 1000 tier exists in approved data; table stays generic)
create table if not exists product_price_tiers (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references products(id) on delete cascade,
  min_qty int not null check (min_qty > 0),
  unit_price_cents int not null check (unit_price_cents >= 0),
  unique (product_id, min_qty)
);

-- configurable option surcharges (approved: intensive fragrance +3000 only)
create table if not exists product_options (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references products(id) on delete cascade,
  key text not null,
  label_de text not null,
  price_delta_cents int not null default 0 check (price_delta_cents >= 0),
  sort_order int not null default 0,
  unique (product_id, key)
);

-- ---------------- SCENTS ----------------
create table if not exists scents (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  category text not null check (category in ('frisch','fruchtig','suess','elegant','intensiv')),
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);
create table if not exists scent_translations (
  id uuid primary key default gen_random_uuid(),
  scent_id uuid not null references scents(id) on delete cascade,
  locale locale not null,
  name text not null,
  description text,
  unique (scent_id, locale)
);
create table if not exists product_scents (
  product_id uuid not null references products(id) on delete cascade,
  scent_id uuid not null references scents(id) on delete cascade,
  primary key (product_id, scent_id)
);

-- ---------------- HOMEPAGE / CONTENT FOUNDATION ----------------
create table if not exists content_blocks (
  id uuid primary key default gen_random_uuid(),
  key text not null,                                        -- e.g. 'home.hero'
  locale locale not null,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  unique (key, locale)
);
create trigger t_content_u before update on content_blocks for each row execute function set_updated_at();

-- ---------------- FORWARD-COMPAT: customers / orders / artwork / approvals ----------------
create table if not exists customers (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid unique,                                 -- links to auth.users later
  email text not null,
  company text,
  created_at timestamptz not null default now()
);
create table if not exists orders (
  id uuid primary key default gen_random_uuid(),
  order_number text unique,
  customer_id uuid references customers(id) on delete set null,
  status text not null default 'draft',
  currency text not null default 'EUR',
  subtotal_cents int not null default 0 check (subtotal_cents >= 0),
  total_cents int not null default 0 check (total_cents >= 0),
  snapshot jsonb,                                           -- immutable order snapshot (later)
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger t_orders_u before update on orders for each row execute function set_updated_at();
create index if not exists idx_orders_customer on orders(customer_id);

create table if not exists order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders(id) on delete cascade,
  product_id uuid references products(id) on delete set null,
  quantity int not null check (quantity > 0),
  unit_price_cents int not null check (unit_price_cents >= 0),
  line_total_cents int not null check (line_total_cents >= 0),
  config jsonb                                              -- chosen scent/options snapshot
);
create index if not exists idx_order_items_order on order_items(order_id);

create table if not exists artwork_uploads (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid references customers(id) on delete set null,
  order_id uuid references orders(id) on delete set null,
  storage_path text not null,                              -- private bucket path
  original_name text,
  side text check (side in ('front','back')),
  created_at timestamptz not null default now()
);
create table if not exists design_approvals (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending','approved','changes_requested')),
  token_hash text,                                          -- hashed approval token (later)
  decided_at timestamptz,
  created_at timestamptz not null default now()
);

-- ================= ROW LEVEL SECURITY =================
alter table site_settings enable row level security;
alter table collections enable row level security;
alter table collection_translations enable row level security;
alter table products enable row level security;
alter table product_translations enable row level security;
alter table product_price_tiers enable row level security;
alter table product_options enable row level security;
alter table scents enable row level security;
alter table scent_translations enable row level security;
alter table product_scents enable row level security;
alter table content_blocks enable row level security;
alter table customers enable row level security;
alter table orders enable row level security;
alter table order_items enable row level security;
alter table artwork_uploads enable row level security;
alter table design_approvals enable row level security;

-- PUBLIC READ: only active/published catalog + content + settings.
create policy pub_read_settings on site_settings for select using (true);
create policy pub_read_collections on collections for select using (is_active);
create policy pub_read_collection_tr on collection_translations for select
  using (exists (select 1 from collections c where c.id = collection_id and c.is_active));
create policy pub_read_products on products for select using (is_active);
create policy pub_read_product_tr on product_translations for select
  using (exists (select 1 from products p where p.id = product_id and p.is_active));
create policy pub_read_tiers on product_price_tiers for select
  using (exists (select 1 from products p where p.id = product_id and p.is_active));
create policy pub_read_options on product_options for select
  using (exists (select 1 from products p where p.id = product_id and p.is_active));
create policy pub_read_scents on scents for select using (is_active);
create policy pub_read_scent_tr on scent_translations for select
  using (exists (select 1 from scents s where s.id = scent_id and s.is_active));
create policy pub_read_product_scents on product_scents for select using (true);
create policy pub_read_content on content_blocks for select using (true);

-- PRIVATE: orders/customers/artwork/approvals — NOT publicly readable, NOT anon writable.
-- (No permissive policies here on purpose. Access is granted later to authenticated
--  owners/admins. Until then only the service-role key, server-side, can touch them.)

-- ADMIN WRITES: intentionally NOT enabled for anon/authenticated yet.
-- Real admin auth is a later phase; until an is_admin() check exists, catalog writes
-- happen only via the server-side service-role client. RLS stays strict.
