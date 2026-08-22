-- 0033 — BUGO Launch Admin + Brand + SEO. ADDITIVE and IDEMPOTENT.
-- Scope: supports the launch admin package (brand identity, editable navigation labels,
-- localized announcement hrefs, role-specific contacts, central business facts, the SEO
-- management center, editable industry content, and localized media ALT). ALL new admin
-- content is stored in the EXISTING JSONB documents (site_settings.content and
-- homepage_content.content) and merged over code defaults at read time — so NO column
-- backfill is needed and EXISTING customized content is never overwritten or erased.
--
-- This migration therefore only:
--   1. guarantees the localized media ALT columns exist (idempotent; defined in 0005),
--   2. re-asserts RLS + public-read / admin-write policies on the content tables,
--   3. revokes any unsafe anon/public write grants on those content tables so mutations
--      can only happen through the is_admin() policies (no public mutation endpoints),
-- all safe to run against a database at 0020 or at 0032. It does NOT touch checkout,
-- webhooks, idempotency, pricing, migrations 0001–0032, or any existing data.

-- ---------------- 1) localized media ALT columns (idempotent) ----------------
-- The storefront now consumes locale-specific ALT (repositories/catalog.db.ts) and the
-- Media library exposes DE/EN/FR ALT editing. Columns were introduced in 0005; re-assert
-- them so a database that somehow lacks them still gets them without error.
alter table if exists media add column if not exists alt_de text;
alter table if exists media add column if not exists alt_en text;
alter table if exists media add column if not exists alt_fr text;

-- ---------------- 2) content tables: RLS + policies (idempotent) ----------------
-- site_settings holds brand/nav/announcement/contacts/business-facts/SEO/industry content.
do $$ begin
  if to_regclass('public.site_settings') is not null then
    execute 'alter table site_settings enable row level security';
    execute 'drop policy if exists pub_read_site_settings on site_settings';
    execute 'create policy pub_read_site_settings on site_settings for select using (true)';
    execute 'drop policy if exists admin_all_site_settings on site_settings';
    execute 'create policy admin_all_site_settings on site_settings for all using (is_admin()) with check (is_admin())';
  end if;
end $$;

-- homepage_content holds the editable homepage launch content (stats/whyBugo/FAQ/etc).
do $$ begin
  if to_regclass('public.homepage_content') is not null then
    execute 'alter table homepage_content enable row level security';
    execute 'drop policy if exists pub_read_homepage on homepage_content';
    execute 'create policy pub_read_homepage on homepage_content for select using (true)';
    execute 'drop policy if exists admin_all_homepage on homepage_content';
    execute 'create policy admin_all_homepage on homepage_content for all using (is_admin()) with check (is_admin())';
  end if;
end $$;

-- media table (ALT edits go through the admin RLS session).
do $$ begin
  if to_regclass('public.media') is not null then
    execute 'alter table media enable row level security';
    execute 'drop policy if exists pub_read_media on media';
    execute 'create policy pub_read_media on media for select using (is_public or is_admin())';
    execute 'drop policy if exists admin_all_media on media';
    execute 'create policy admin_all_media on media for all using (is_admin()) with check (is_admin())';
  end if;
end $$;

-- ---------------- 3) revoke unsafe table-level write grants ----------------
-- Public read stays (RLS still gates rows); revoke INSERT/UPDATE/DELETE from anon and the
-- PUBLIC role on the content tables so brand/SEO/settings mutations are only possible via
-- the is_admin() policies above — never a public/anon mutation path. SELECT is preserved.
do $$
declare t text;
begin
  foreach t in array array['site_settings','homepage_content','media'] loop
    if to_regclass('public.'||t) is not null then
      begin execute format('revoke insert, update, delete on table public.%I from anon', t); exception when others then null; end;
      begin execute format('revoke insert, update, delete on table public.%I from public', t); exception when others then null; end;
      -- keep read access working for the public Data API (rows still gated by RLS)
      begin execute format('grant select on table public.%I to anon', t); exception when others then null; end;
      begin execute format('grant select on table public.%I to authenticated', t); exception when others then null; end;
    end if;
  end loop;
end $$;
