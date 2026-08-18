-- Phase 6D — global site settings + quote requests. ADDITIVE. Does NOT touch
-- 0005/0006/0007. No drops, no reseed. RLS stays enabled everywhere.

-- ---------------- global site settings (single localized JSONB doc) ----------------
-- Mirrors the homepage_content pattern: one row, JSONB, public read + admin write.
-- Storefront reads DB-first and falls back to shipped config/seed, so nothing
-- goes blank before an admin saves.
create table if not exists site_settings (
  id text primary key default 'default',
  content jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null
);
alter table site_settings enable row level security;
drop policy if exists pub_read_site_settings on site_settings;
create policy pub_read_site_settings on site_settings for select using (true);
drop policy if exists admin_all_site_settings on site_settings;
create policy admin_all_site_settings on site_settings for all using (is_admin()) with check (is_admin());

-- ---------------- quote requests (Angebot anfragen) ----------------
create table if not exists quotes (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  status text not null default 'new' check (status in ('new','in_progress','done')),
  locale locale not null default 'de',
  company text,
  name text,
  email text,
  phone text,
  product_code text,
  quantity int,
  message text,
  source text
);
alter table quotes enable row level security;

-- Public may INSERT a quote request (validated server-side in the action); they
-- may NOT read others' quotes. Admins have full access.
drop policy if exists quote_public_insert on quotes;
create policy quote_public_insert on quotes for insert to anon, authenticated with check (true);
drop policy if exists admin_all_quotes on quotes;
create policy admin_all_quotes on quotes for all using (is_admin()) with check (is_admin());

create index if not exists quotes_created_idx on quotes (created_at desc);
create index if not exists quotes_status_idx on quotes (status);
