-- 0034 — FINAL LAUNCH TECHNICAL CLOSEOUT. ADDITIVE / IDEMPOTENT where practical.
-- Covers §1 (customer-files size limit) and §4 (quote insert security + rate limit).
-- Does NOT touch checkout lease/idempotency/benefit/payment logic, the webhook state
-- machine, or migrations 0001–0033. Safe to run against a DB at 0020 or at 0033.
-- Not run against production by this task.

-- =====================================================================================
-- §1 CUSTOMER-FILES BUCKET SIZE LIMIT
-- The customer-files (private artwork) bucket had no explicit file_size_limit like
-- cms-media. Set a 50 MB per-file limit appropriate for print artwork. Bucket stays PRIVATE
-- (public=false untouched). Idempotent: only updates the limit if the bucket row exists.
-- =====================================================================================
do $$
begin
  if to_regclass('storage.buckets') is not null then
    update storage.buckets
      set file_size_limit = 52428800          -- 50 MB
      where id = 'customer-files';
    -- never flip privacy here; if the bucket somehow is public, force it private (defensive).
    update storage.buckets set public = false where id = 'customer-files' and public is true;
  end if;
end $$;

-- =====================================================================================
-- §4 QUOTE INSERT SECURITY
-- 0008 shipped `quote_public_insert ... with check (true)`, which lets anon/authenticated
-- INSERT directly through the Supabase REST API, bypassing the server action's validation
-- and honeypot. Remove that capability. The storefront QuoteForm continues to work because
-- submitQuoteAction now writes with the SERVICE-ROLE client (server-only) AFTER validation.
-- RLS still blocks anon: with the insert policy dropped and no table-level INSERT grant to
-- anon, a direct REST insert is denied.
-- =====================================================================================
drop policy if exists quote_public_insert on quotes;
-- admin_all_quotes (is_admin) from 0008 remains; service-role bypasses RLS for the action.

-- Revoke any direct table INSERT/UPDATE/DELETE from anon/authenticated/public on quotes so
-- there is no write path except the service-role server action (and admins via RLS). Keep no
-- public SELECT (quotes were never publicly readable). Idempotent + defensive.
do $$
begin
  if to_regclass('public.quotes') is not null then
    begin execute 'revoke insert, update, delete on table public.quotes from anon'; exception when others then null; end;
    begin execute 'revoke insert, update, delete on table public.quotes from authenticated'; exception when others then null; end;
    begin execute 'revoke insert, update, delete on table public.quotes from public'; exception when others then null; end;
  end if;
end $$;

-- -------------------------------------------------------------------------------------
-- §4 DB-BACKED ATOMIC RATE LIMIT (no external/paid dependency).
-- Keyed by a PRIVACY-SAFE hash (the server passes sha256(email|window) — never a raw IP or
-- raw email). Fixed-window counter; the server decides the window + max. No raw PII stored.
-- -------------------------------------------------------------------------------------
create table if not exists quote_rate_limits (
  bucket_key text primary key,               -- e.g. sha256("<normalized-email>|<window-start>")
  window_start timestamptz not null default now(),
  hits int not null default 0
);
alter table quote_rate_limits enable row level security;
-- No public policies: only the service-role client (RLS-exempt) touches this table.

revoke all on table quote_rate_limits from anon, authenticated, public;

-- Atomic check-and-increment. Returns TRUE when the caller is ALLOWED (under the limit),
-- FALSE when the limit is exceeded. SECURITY DEFINER so the service role can call it; it is
-- NOT granted to anon/authenticated. Prunes its own stale rows opportunistically.
create or replace function quote_rate_check(p_key text, p_max int, p_window_seconds int)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now timestamptz := now();
  v_hits int;
  v_start timestamptz;
begin
  -- opportunistic prune of expired windows (keeps the table tiny; bounded work).
  delete from quote_rate_limits where window_start < v_now - make_interval(secs => p_window_seconds * 4);

  insert into quote_rate_limits as q (bucket_key, window_start, hits)
    values (p_key, v_now, 1)
  on conflict (bucket_key) do update
    set hits = case when q.window_start < v_now - make_interval(secs => p_window_seconds)
                    then 1 else q.hits + 1 end,
        window_start = case when q.window_start < v_now - make_interval(secs => p_window_seconds)
                    then v_now else q.window_start end
  returning hits, window_start into v_hits, v_start;

  return v_hits <= p_max;
end $$;

revoke all on function quote_rate_check(text, int, int) from public, anon, authenticated;
