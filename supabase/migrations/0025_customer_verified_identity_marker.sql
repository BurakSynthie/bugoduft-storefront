-- 0025 — §P0-1b VERIFIED-IDENTITY MARKER FOR EMAIL-BASED GUEST-COMMERCE LINKING.
--
-- ROOT CAUSE (residual after 0024):
--   ensureCustomerRow() creates an auth-linked `customers` row even when the Supabase
--   Auth email is UNVERIFIED. Both Shopify webhook linking paths then trust
--   `customers.email` for any auth-linked row (main: `.eq('email',…)`; sample:
--   `.eq('email',…).not('auth_user_id','is',null)`). So an attacker can sign up as
--   victim@example.com WITHOUT confirming the address, obtain an auth-linked row, and
--   later have victim@example.com's guest order / sample credit attach to them. 0024
--   only blocks Data-API poisoning of the email column; this write happens via the
--   service role, so 0024 does not cover it.
--
-- FIX (smallest robust design):
--   Add an explicit, SERVER-CONTROLLED marker `email_verified_at`. It is stamped ONLY
--   by server code (ensureCustomerRow) after confirming the Supabase Auth user's email
--   is verified. Email-based guest-commerce linking must require this marker to be
--   non-null — NOT merely `auth_user_id is not null`. This makes the invariant a
--   property of persisted data rather than an assumption about Dashboard settings.
--
-- HISTORICAL ROWS: existing auth-linked rows get `email_verified_at = null` (default),
--   so they are NOT blindly trusted. They become linkable only after the owning user's
--   next authenticated request re-runs ensureCustomerRow and the email is confirmed
--   verified — i.e. trust is re-established explicitly, never assumed.
--
-- IDENTITY IMMUTABILITY: `email_verified_at` is identity-sensitive. The 0024 trigger
--   already blocks non-service_role email/auth_user_id/id changes; here we extend it so
--   a customer cannot set/clear their own verification marker via the Data API either.
--
-- PRODUCTION: 0001–0020 applied; 0021–0024 applied in order before this. Additive +
--   idempotent. No backfill that would grant trust — null is the safe default.

alter table customers add column if not exists email_verified_at timestamptz;

comment on column customers.email_verified_at is
  'Server-controlled. Non-null ONLY when ensureCustomerRow confirmed the Supabase Auth '
  'email is verified. REQUIRED (non-null) for any email-based guest-order / sample-credit '
  'linking. Never set from client input; immutable via the Data API (0024/0025 trigger).';

-- Extend the 0024 immutability trigger to also protect email_verified_at from any
-- non-service_role mutation. Re-create the function (schema-qualified, empty search_path).
create or replace function public.enforce_customer_identity_immutable()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if current_setting('role', true) = 'service_role'
     or (select current_user) = 'service_role' then
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
    if new.email_verified_at is distinct from old.email_verified_at then
      raise exception 'customer email_verified_at is server-controlled'
        using errcode = 'insufficient_privilege';
    end if;
  end if;

  if tg_op = 'INSERT' then
    raise exception 'customer rows are created server-side only'
      using errcode = 'insufficient_privilege';
  end if;

  return new;
end;
$$;

-- trigger definition unchanged (0024 already created t_customer_identity_immutable),
-- but re-assert idempotently in case 0024 and 0025 are applied against differing states.
drop trigger if exists t_customer_identity_immutable on customers;
create trigger t_customer_identity_immutable
  before insert or update on customers
  for each row execute function public.enforce_customer_identity_immutable();

revoke all on function public.enforce_customer_identity_immutable() from public;
do $$ begin execute 'revoke all on function public.enforce_customer_identity_immutable() from anon';
exception when undefined_object then null; end $$;
do $$ begin execute 'revoke all on function public.enforce_customer_identity_immutable() from authenticated';
exception when undefined_object then null; end $$;
