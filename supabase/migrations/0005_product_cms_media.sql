-- Phase 6A — Product CMS + Media foundation (ADDITIVE, safe to run once).
-- Creates media library + product presentation fields. Nothing here drops or
-- rewrites existing tables/data. Public read is limited to published/public rows;
-- all writes require is_admin() (defined in 0004). The storefront continues to
-- read seed data until DB reads are wired in a later phase — this migration only
-- provisions the schema so admin media/CMS persistence can be enabled next.

-- ---------------- media library ----------------
create table if not exists media (
  id uuid primary key default gen_random_uuid(),
  storage_path text not null unique,
  media_type text not null check (media_type in ('image','video')),
  mime_type text not null,
  original_filename text,
  width int,
  height int,
  size_bytes bigint,
  is_public boolean not null default true,
  alt_de text, alt_en text, alt_fr text,
  uploaded_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists media_type_idx on media(media_type);

-- ---------------- product presentation fields (additive) ----------------
alter table products add column if not exists cover_media_id  uuid references media(id) on delete set null;
alter table products add column if not exists video_media_id  uuid references media(id) on delete set null;
alter table products add column if not exists poster_media_id uuid references media(id) on delete set null;
alter table products add column if not exists sort_order int not null default 0;

-- localized presentation content lives beside the existing per-locale rows
alter table product_translations add column if not exists features        text[] not null default '{}';
alter table product_translations add column if not exists use_case        text;
alter table product_translations add column if not exists production_info text;
alter table product_translations add column if not exists delivery_info   text;
alter table product_translations add column if not exists moq_text        text;
alter table product_translations add column if not exists badge           text;
alter table product_translations add column if not exists og_image        text;

-- ---------------- product ⇄ media gallery join ----------------
create table if not exists product_media (
  product_id uuid not null references products(id) on delete cascade,
  media_id   uuid not null references media(id)    on delete cascade,
  role text not null default 'gallery',
  sort_order int not null default 0,
  primary key (product_id, media_id, role)
);
create index if not exists product_media_product_idx on product_media(product_id);

-- ---------------- RLS ----------------
alter table media enable row level security;
alter table product_media enable row level security;

drop policy if exists pub_read_media on media;
create policy pub_read_media on media for select using (is_public or is_admin());
drop policy if exists admin_all_media on media;
create policy admin_all_media on media for all using (is_admin()) with check (is_admin());

drop policy if exists pub_read_product_media on product_media;
create policy pub_read_product_media on product_media for select using (true);
drop policy if exists admin_all_product_media on product_media;
create policy admin_all_product_media on product_media for all using (is_admin()) with check (is_admin());
