-- Phase 6E-B2 — P0 blocker repair. ADDITIVE ONLY. Does NOT touch 0001-0010.
-- No drops, no destructive reseed, no data reset.
--
-- ROOT CAUSE (confirmed by reading 0001 and 0008):
--   0001_init.sql created `site_settings` with a completely different layout:
--     id boolean primary key default true check (id), default_currency text, ...
--   0008_site_settings_quotes.sql later added:
--     create table if not exists site_settings (id text primary key default 'default',
--       content jsonb not null default '{}'::jsonb, updated_at, updated_by)
--   Because the table already existed from 0001, Postgres' `CREATE TABLE IF NOT EXISTS`
--   was a silent no-op — production never gained the `content` column. Every environment
--   that ran 0001 before 0008 shipped is still on the old (boolean-id, no-content) layout,
--   which is exactly why the admin/storefront settings code (repositories/settings.ts,
--   lib/settings/model.ts — both written against the 0008 `content jsonb` shape) fails
--   with "Could not find the 'content' column of 'site_settings' in the schema cache".
--
-- FIX: detect which layout is currently live and reconcile to the 0008 (content-jsonb)
-- layout that all Phase 6D+ application code expects, WITHOUT dropping the legacy data.
--   - legacy (0001) layout present, no `content` column  -> rename the legacy table out of
--     the way (site_settings_legacy_0001), rebuild `site_settings` on the jsonb layout, and
--     seed the new row from whatever legacy business values existed (email/whatsapp).
--   - jsonb layout already present (fresh DB that only ever ran 0008+, or this migration
--     already ran once) -> no-op beyond reasserting RLS/policies (idempotent).
--   - neither exists yet (brand-new DB, migrations run out of order) -> create it.

do $$
declare
  has_content boolean;
  has_legacy_cols boolean;
  legacy_row record;
begin
  select exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'site_settings' and column_name = 'content'
  ) into has_content;

  if not has_content then
    select exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'site_settings' and column_name = 'default_currency'
    ) into has_legacy_cols;

    if has_legacy_cols then
      -- Preserve every legacy column/row under a new name — never dropped.
      execute 'alter table site_settings rename to site_settings_legacy_0001';

      create table site_settings (
        id text primary key default 'default',
        content jsonb not null default '{}'::jsonb,
        updated_at timestamptz not null default now(),
        updated_by uuid references auth.users(id) on delete set null
      );

      execute 'select admin_notification_email, whatsapp_number from site_settings_legacy_0001 limit 1'
        into legacy_row;

      if found then
        insert into site_settings (id, content, updated_at)
        values (
          'default',
          jsonb_build_object(
            'contact', jsonb_build_object(
              'email', coalesce(legacy_row.admin_notification_email, ''),
              'whatsapp', coalesce(legacy_row.whatsapp_number, ''),
              'phone', '', 'instagram', '', 'facebook', '', 'linkedin', ''
            )
          ),
          now()
        )
        on conflict (id) do nothing;
      else
        insert into site_settings (id, content) values ('default', '{}'::jsonb) on conflict (id) do nothing;
      end if;
    else
      create table if not exists site_settings (
        id text primary key default 'default',
        content jsonb not null default '{}'::jsonb,
        updated_at timestamptz not null default now(),
        updated_by uuid references auth.users(id) on delete set null
      );
    end if;
  end if;
end $$;

-- Reassert RLS + policies unconditionally (idempotent; covers both the "already correct"
-- and "just rebuilt" paths). Public read, admin-only write — same as 0008.
alter table site_settings enable row level security;
drop policy if exists pub_read_settings on site_settings;          -- legacy 0001 policy name, harmless if absent
drop policy if exists pub_read_site_settings on site_settings;
create policy pub_read_site_settings on site_settings for select using (true);
drop policy if exists admin_all_site_settings on site_settings;
create policy admin_all_site_settings on site_settings for all using (is_admin()) with check (is_admin());

-- Guarantee the single default row always exists so getSettings() never has to
-- special-case a missing row (defensive; upsert-on-save already handles this too).
insert into site_settings (id, content) values ('default', '{}'::jsonb) on conflict (id) do nothing;

-- If the legacy table survived the rename above, lock its RLS down (admin-only, read-only
-- historical reference — nothing in the app reads it anymore).
do $$ begin
  if exists (select 1 from information_schema.tables where table_schema='public' and table_name='site_settings_legacy_0001') then
    execute 'alter table site_settings_legacy_0001 enable row level security';
    execute 'drop policy if exists pub_read_settings on site_settings_legacy_0001';
    execute 'drop policy if exists legacy_admin_read on site_settings_legacy_0001';
    execute 'create policy legacy_admin_read on site_settings_legacy_0001 for select using (is_admin())';
  end if;
end $$;
