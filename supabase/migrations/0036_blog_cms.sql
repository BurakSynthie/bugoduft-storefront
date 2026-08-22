-- 0036 — BUGO Blog / Knowledge CMS. ADDITIVE and IDEMPOTENT.
--
-- Scope: adds a multilingual Blog / Knowledge CMS (blog_posts + blog_post_translations)
-- with RLS following the EXISTING BUGO admin security model (is_admin() from 0004):
--   * public may SELECT only PUBLISHED posts / their PUBLISHED-post translations,
--   * admins (is_admin()) may do everything.
-- Draft/unpublished content is NEVER exposed through the public (anon) row set.
--
-- This migration is safe to apply after 0035. It does NOT touch checkout, webhooks,
-- idempotency, pricing, orders, customer identity, media, site_settings, migrations
-- 0001–0035, or any existing data. The Blog index page SEO is stored inside the EXISTING
-- site_settings.content JSONB (no new table for that) — see lib/settings/model.ts.
--
-- Article content is stored as a STRUCTURED, block-based JSONB array (not raw HTML), so the
-- storefront renders known-safe block types only (see lib/blog/content.ts). No unsanitized
-- HTML is ever stored or rendered.

-- ---------------- blog_posts (shared, article-level) ----------------
create table if not exists blog_posts (
  id             uuid primary key default gen_random_uuid(),
  status         text not null default 'draft' check (status in ('draft','published')),
  cover_media_id uuid references media(id) on delete set null,
  published_at   timestamptz,
  created_by     uuid references auth.users(id) on delete set null,
  updated_by     uuid references auth.users(id) on delete set null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index if not exists blog_posts_status_idx       on blog_posts(status);
create index if not exists blog_posts_published_at_idx  on blog_posts(published_at desc);

-- ---------------- blog_post_translations (localized DE/EN/FR) ----------------
-- One row per (post, locale). `content` is the structured block array (JSONB). A locale row
-- exists only when that translation has been authored — hreflang/sitemap enumerate only the
-- translations that ACTUALLY exist.
create table if not exists blog_post_translations (
  id               uuid primary key default gen_random_uuid(),
  blog_post_id     uuid not null references blog_posts(id) on delete cascade,
  locale           text not null check (locale in ('de','en','fr')),
  slug             text not null,
  title            text not null default '',
  h1               text not null default '',
  excerpt          text not null default '',
  category         text not null default '',
  content          jsonb not null default '[]'::jsonb,
  cover_alt        text not null default '',
  seo_title        text not null default '',
  meta_description text not null default '',
  og_image         text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (blog_post_id, locale),      -- one translation per locale per post
  unique (locale, slug)               -- slug unique WITHIN a locale (localized URLs)
);
create index if not exists blog_post_tr_post_idx        on blog_post_translations(blog_post_id);
create index if not exists blog_post_tr_locale_slug_idx on blog_post_translations(locale, slug);

-- keep updated_at fresh (set_updated_at() exists from earlier migrations)
do $$ begin
  if to_regprocedure('set_updated_at()') is not null then
    drop trigger if exists trg_blog_posts_updated on blog_posts;
    create trigger trg_blog_posts_updated before update on blog_posts
      for each row execute function set_updated_at();
    drop trigger if exists trg_blog_post_tr_updated on blog_post_translations;
    create trigger trg_blog_post_tr_updated before update on blog_post_translations
      for each row execute function set_updated_at();
  end if;
end $$;

-- ---------------- RLS ----------------
alter table blog_posts             enable row level security;
alter table blog_post_translations enable row level security;

-- blog_posts: public sees ONLY published posts; admins see/do everything.
drop policy if exists pub_read_blog_posts on blog_posts;
create policy pub_read_blog_posts on blog_posts
  for select using (status = 'published' or is_admin());
drop policy if exists admin_all_blog_posts on blog_posts;
create policy admin_all_blog_posts on blog_posts
  for all using (is_admin()) with check (is_admin());

-- blog_post_translations: public sees a translation ONLY when its parent post is published.
-- A draft's translations are never in the anon row set even if the slug is guessed.
drop policy if exists pub_read_blog_post_tr on blog_post_translations;
create policy pub_read_blog_post_tr on blog_post_translations
  for select using (
    exists (select 1 from blog_posts p where p.id = blog_post_id and p.status = 'published')
    or is_admin()
  );
drop policy if exists admin_all_blog_post_tr on blog_post_translations;
create policy admin_all_blog_post_tr on blog_post_translations
  for all using (is_admin()) with check (is_admin());

-- ---------------- table privileges (RLS is the real write boundary) ----------------
-- The Blog admin runs under the NORMAL `authenticated` Postgres role (anon-key server
-- client + admin session) — NOT service_role. So `authenticated` must KEEP the underlying
-- INSERT/UPDATE/DELETE table privileges; otherwise RLS never gets to evaluate and even a
-- valid admin's writes fail with a privilege error. The security boundary for writes is the
-- is_admin() RLS policy above (an ordinary authenticated customer has is_admin()=false and is
-- blocked by RLS, not by a missing table grant). This mirrors the EXISTING pattern used for
-- the other admin-writable tables in 0033 (site_settings/homepage_content/media): revoke
-- writes from anon + PUBLIC, keep SELECT for both, and let authenticated's DML be gated by RLS.
do $$ begin
  if exists (select 1 from pg_roles where rolname='anon') then
    revoke insert, update, delete on blog_posts             from anon;
    revoke insert, update, delete on blog_post_translations from anon;
    grant  select                  on blog_posts             to anon;   -- rows still gated by RLS
    grant  select                  on blog_post_translations to anon;
  end if;
  -- Revoke writes from the implicit PUBLIC role too (defence-in-depth), never from authenticated.
  revoke insert, update, delete on blog_posts             from public;
  revoke insert, update, delete on blog_post_translations from public;
  if exists (select 1 from pg_roles where rolname='authenticated') then
    -- authenticated KEEPS DML so is_admin() RLS can decide; ordinary customers are blocked by RLS.
    grant select, insert, update, delete on blog_posts             to authenticated;
    grant select, insert, update, delete on blog_post_translations to authenticated;
  end if;
end $$;
