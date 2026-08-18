-- Phase 6B — Storage bucket + homepage CMS content (ADDITIVE, safe to run once).
-- Builds on 0005 (media, product_media, presentation columns already applied).
-- Nothing here drops or rewrites existing tables/data. Public read is limited to
-- storefront-facing content; all writes require is_admin() (from 0004).

-- ---------------- public CMS media storage bucket ----------------
-- One intentional public bucket for storefront CMS media (product + homepage).
-- MIME + size limits are enforced at the storage layer as an extra guard.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('cms-media', 'cms-media', true, 52428800,
        array['image/jpeg','image/png','image/webp','video/mp4','video/webm'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- storage.objects RLS: public read for this bucket, admin-only writes/deletes.
drop policy if exists cms_media_public_read on storage.objects;
create policy cms_media_public_read on storage.objects
  for select using (bucket_id = 'cms-media');

drop policy if exists cms_media_admin_insert on storage.objects;
create policy cms_media_admin_insert on storage.objects
  for insert with check (bucket_id = 'cms-media' and is_admin());

drop policy if exists cms_media_admin_update on storage.objects;
create policy cms_media_admin_update on storage.objects
  for update using (bucket_id = 'cms-media' and is_admin())
  with check (bucket_id = 'cms-media' and is_admin());

drop policy if exists cms_media_admin_delete on storage.objects;
create policy cms_media_admin_delete on storage.objects
  for delete using (bucket_id = 'cms-media' and is_admin());

-- ---------------- homepage CMS content ----------------
-- Single-row, localized JSONB document matching the existing HomeExtra shape:
--   content = { de: {...}, en: {...}, fr: {...} }
-- The storefront reads this and falls back to the shipped seed when a locale or
-- the whole row is absent, so the homepage is never suddenly empty.
create table if not exists homepage_content (
  id text primary key default 'default',
  content jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null
);

alter table homepage_content enable row level security;

drop policy if exists pub_read_homepage on homepage_content;
create policy pub_read_homepage on homepage_content for select using (true);

drop policy if exists admin_all_homepage on homepage_content;
create policy admin_all_homepage on homepage_content
  for all using (is_admin()) with check (is_admin());
