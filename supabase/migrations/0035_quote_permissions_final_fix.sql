-- 0035 — QUOTE PERMISSIONS FINAL FIX. ADDITIVE / IDEMPOTENT.
-- Corrects two over-broad effects of 0034 without touching checkout/webhook/payment/benefit
-- logic or migrations 0001–0034.
--
--   §1 0034 revoked UPDATE/DELETE on public.quotes from `authenticated`. But an admin acts as
--      the `authenticated` DB role (repositories/admin-quotes.ts → createSupabaseServerClient),
--      relying on the admin_all_quotes RLS policy (is_admin()). RLS gates ROWS but cannot
--      restore missing TABLE privileges, so admin quote update/delete broke. Restore
--      table-level UPDATE/DELETE to `authenticated` while RLS still limits those ops to admins.
--      INSERT stays revoked (the only write path is the service-role server action).
--
--   §2 0034 created quote_rate_check() and revoked EXECUTE from public/anon/authenticated but
--      never granted it to `service_role`. submitQuoteAction calls it via the service-role
--      client, so grant EXECUTE to service_role and harden search_path.

-- ============================ §1 quotes table privileges ============================
do $$
begin
  if to_regclass('public.quotes') is not null then
    -- anon: no write privileges at all.
    begin execute 'revoke insert, update, delete on table public.quotes from anon'; exception when others then null; end;
    -- authenticated: NO INSERT (server action uses service role); SELECT preserved; UPDATE and
    -- DELETE restored at the TABLE level so the admin_all_quotes RLS policy can allow them for
    -- admins. A NON-admin authenticated user is still blocked BY RLS (no permissive USING/CHECK
    -- policy matches a non-admin), so this does not let ordinary customers modify quotes.
    begin execute 'revoke insert on table public.quotes from authenticated'; exception when others then null; end;
    begin execute 'grant update, delete on table public.quotes to authenticated'; exception when others then null; end;
    -- public role: ensure no stray write privileges linger.
    begin execute 'revoke insert, update, delete on table public.quotes from public'; exception when others then null; end;
  end if;
end $$;

-- Re-assert the admin-only RLS policy (idempotent) — quotes stay writable ONLY by is_admin().
-- (admin_all_quotes was created in 0008; recreate defensively so table-priv changes above are
-- always paired with the row-level admin gate. No public update/delete policy is ever created.)
do $$
begin
  if to_regclass('public.quotes') is not null then
    execute 'alter table public.quotes enable row level security';
    execute 'drop policy if exists admin_all_quotes on public.quotes';
    execute 'create policy admin_all_quotes on public.quotes for all using (is_admin()) with check (is_admin())';
  end if;
end $$;

-- ============================ §2 quote_rate_check privileges + hardening ============================
-- Harden the SECURITY DEFINER function: empty search_path + explicit public.* schema-qualified
-- references, so it cannot be hijacked via a mutable search_path. Behavior is unchanged.
create or replace function public.quote_rate_check(p_key text, p_max int, p_window_seconds int)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := now();
  v_hits int;
  v_start timestamptz;
begin
  -- opportunistic prune of expired windows (keeps the table tiny; bounded work).
  delete from public.quote_rate_limits where window_start < v_now - make_interval(secs => p_window_seconds * 4);

  insert into public.quote_rate_limits as q (bucket_key, window_start, hits)
    values (p_key, v_now, 1)
  on conflict (bucket_key) do update
    set hits = case when q.window_start < v_now - make_interval(secs => p_window_seconds)
                    then 1 else q.hits + 1 end,
        window_start = case when q.window_start < v_now - make_interval(secs => p_window_seconds)
                    then v_now else q.window_start end
  returning q.hits, q.window_start into v_hits, v_start;

  return v_hits <= p_max;
end $$;

-- Only the service-role (RLS/definer-exempt server action) may execute the limiter.
revoke all on function public.quote_rate_check(text, int, int) from public, anon, authenticated;
grant execute on function public.quote_rate_check(text, int, int) to service_role;

-- quote_rate_limits stays service-role-only (created + revoked in 0034). Re-assert defensively.
do $$
begin
  if to_regclass('public.quote_rate_limits') is not null then
    begin execute 'revoke all on table public.quote_rate_limits from anon, authenticated, public'; exception when others then null; end;
  end if;
end $$;
