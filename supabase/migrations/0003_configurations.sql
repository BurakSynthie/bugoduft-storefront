-- BUGO DUFT — Phase 4B: configurator persistence + private artwork storage.
-- Money = integer cents. Configurations are private (no public read; no anon write).

do $$ begin create type config_status as enum ('draft','checkout_pending','ordered'); 
exception when duplicate_object then null; end $$;

create table if not exists configurations (
  id uuid primary key default gen_random_uuid(),
  locale locale not null,
  product_id uuid references products(id) on delete set null,
  collection_code text not null,
  quantity int not null check (quantity >= 1000 and quantity <= 100000 and quantity % 1000 = 0),
  scent_code text,
  intensity text not null default 'normal' check (intensity in ('normal','intense')),
  shape text not null,
  front_path text, front_instructions text,
  same_back_as_front boolean not null default true,
  back_path text, back_instructions text,
  supporting jsonb not null default '[]'::jsonb,
  base_price_cents int not null check (base_price_cents >= 0),
  surcharge_cents int not null default 0 check (surcharge_cents >= 0),
  total_price_cents int not null check (total_price_cents >= 0),
  status config_status not null default 'draft',
  shopify_cart_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger t_configurations_u before update on configurations for each row execute function set_updated_at();
create index if not exists idx_configurations_status on configurations(status);

alter table configurations enable row level security;
-- No public/anon policies: configurations are reachable only via the server-side
-- service-role client (checkout actions). Customer/admin read policies come with auth later.

-- ---------------- private storage bucket for customer artwork ----------------
insert into storage.buckets (id, name, public)
values ('customer-files', 'customer-files', false)
on conflict (id) do nothing;
-- No permissive storage policies for anon: uploads happen through server-issued
-- signed upload URLs (service role). Do not add public read/write here.
