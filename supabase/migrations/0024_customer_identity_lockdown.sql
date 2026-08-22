-- 0024 — §P0-1 CUSTOMER EMAIL POISONING / CROSS-ACCOUNT ORDER LINKING (release blocker).
--
-- ROOT CAUSE (0009_customer_accounts.sql):
--   customer_self_insert / customer_self_update granted authenticated users direct
--   INSERT/UPDATE on `customers` via the public Supabase Data API, gated ONLY by
--   auth_user_id = auth.uid(). The WITH CHECK re-asserts ownership of the ROW but
--   places NO restriction on which COLUMNS may change. An authenticated attacker A
--   could therefore:  update customers set email = '<victim B's email>' where auth_user_id = A;
--   Downstream guest-order / sample-credit linking (webhook route + ensureCustomerRow)
--   associates historical guest commerce by `customers.email`, so rewriting A's email
--   to B's address attaches B's guest orders / sample credit to A. Cross-account theft.
--
-- WHY REMOVING THE WRITE POLICIES IS SAFE:
--   There is NO browser/anon/authenticated write path to `customers` anywhere in the
--   codebase. Every legitimate write (ensureCustomerRow, webhook linking) runs through
--   the SERVICE ROLE (createSupabaseServiceClient), which BYPASSES RLS entirely and is
--   unaffected by dropping these policies. Authoritative email is sourced server-side
--   from the verified Supabase Auth identity (getCustomerUser → sb.auth.getUser() →
--   normalizeEmail) — never from client input. So the self INSERT/UPDATE policies are
--   pure attack surface with zero legitimate use. We remove them and keep self-READ.
--
-- DEFENSE IN DEPTH:
--   A trigger makes email / auth_user_id / id IMMUTABLE for any non-service_role caller,
--   so even if a future migration re-introduces a self-update policy by mistake, identity
--   columns cannot be mutated through the Data API. Service role (server sync) is exempt.
--
-- PRODUCTION: 0001–0020 applied; 0021–0023 NOT yet applied. This migration is additive
--   and idempotent; it only drops the two dangerous write policies and installs guards.

-- ---------------- 1. remove the poisoning surface, keep self-read ----------------
drop policy if exists customer_self_insert on customers;
drop policy if exists customer_self_update on customers;
-- self-read is preserved exactly as in 0009 (re-assert idempotently):
drop policy if exists customer_self_read on customers;
create policy customer_self_read on customers for select using (auth_user_id = auth.uid());

-- ---------------- 2. identity-immutability trigger (defense in depth) ----------------
-- Blocks changes to identity-sensitive columns unless the current role is the Supabase
-- service role. `search_path=''` + schema-qualified objects; no privilege escalation.
create or replace function public.enforce_customer_identity_immutable()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  -- service_role performs authoritative server-side identity sync and is exempt.
  if current_setting('role', true) = 'service_role'
     or (select current_user) = 'service_role' then
    -- still normalize on the way in so stored email is always canonical.
    if new.email is not null then new.email := lower(btrim(new.email)); end if;
    return new;
  end if;

  if tg_op = 'UPDATE' then
    if new.email is distinct from old.email then
      raise exception 'customer email is server-controlled and cannot be changed via the Data API'
        using errcode = 'insufficient_privilege';
    end if;
    if new.auth_user_id is distinct from old.auth_user_id then
      raise exception 'customer auth_user_id is immutable'
        using errcode = 'insufficient_privilege';
    end if;
    if new.id is distinct from old.id then
      raise exception 'customer id is immutable'
        using errcode = 'insufficient_privilege';
    end if;
  end if;

  -- Any non-service_role INSERT is likewise disallowed (no legitimate client path exists).
  if tg_op = 'INSERT' then
    raise exception 'customer rows are created server-side only'
      using errcode = 'insufficient_privilege';
  end if;

  return new;
end;
$$;

drop trigger if exists t_customer_identity_immutable on customers;
create trigger t_customer_identity_immutable
  before insert or update on customers
  for each row execute function public.enforce_customer_identity_immutable();

-- The trigger function must not be callable/abusable directly.
revoke all on function public.enforce_customer_identity_immutable() from public;
do $$ begin
  execute 'revoke all on function public.enforce_customer_identity_immutable() from anon';
exception when undefined_object then null; end $$;
do $$ begin
  execute 'revoke all on function public.enforce_customer_identity_immutable() from authenticated';
exception when undefined_object then null; end $$;

-- Order RLS is intentionally UNCHANGED: customer_read_own_orders / customer_read_own_order_items
-- from 0009 still scope reads to the caller's own customer_id. Because email can no longer be
-- rewritten, those policies now provide true cross-account isolation.
