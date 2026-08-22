-- BUGO DUFT — Release-gate hardening (CORRECTED). ADDITIVE ONLY.
-- Does NOT modify 0001–0020. Every statement is idempotent / re-runnable. Covers:
--   §HIGH-6  Canonical quantity envelope CHECK constraints on products (min/max/step must be
--            multiples of 1.000, within [1.000, 100.000], max >= min).
--   §P0-3    design_mode CHECK constraint (must be one of the two known modes).
--   §P0-1/§P0-5  Atomic, OWNERSHIP-TOKEN per-configuration checkout lease. The previous version of
--            this migration used a timestamp-ONLY lease that a STALE owner could release out from
--            under a NEWER owner (the race described in §P0-5). This corrected version issues a
--            unique token on claim and requires the matching token on release, so only the current
--            owner can release the lease.
--
-- NOTE FOR PRODUCTION: the earlier (broken) 0021 was NEVER applied in production. This corrected
-- file is what production runs as 0021. It also self-heals any dev/staging DB where the broken
-- boolean-returning functions exist, by DROPPING them before recreating with the new signature.
--
-- IMPORTANT: existing 0001–0020 are FROZEN. Do NOT re-run them. Apply this file (and then 0022).

-- =====================================================================
-- §HIGH-6  PRODUCTS QUANTITY ENVELOPE
-- ---------------------------------------------------------------------
-- Order quantities are multiples of 1.000 in [1.000, 100.000]. Per-product min/max/step may be
-- STRICTER but must align to that grid. (Coherence of (max-min) % step == 0 is enforced in the
-- admin save path + admin_save_product RPC; this constraint guarantees the 1.000-grid + range.)
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'products_qty_envelope_chk') then
    alter table public.products
      add constraint products_qty_envelope_chk check (
        min_qty >= 1000 and min_qty <= 100000 and min_qty % 1000 = 0
        and max_qty >= 1000 and max_qty <= 100000 and max_qty % 1000 = 0
        and qty_step >= 1000 and qty_step <= 100000 and qty_step % 1000 = 0
        and max_qty >= min_qty
        -- §HIGH-4 COHERENCE: step alignment is measured from min, so max must be a whole number of
        -- steps from min (otherwise max would be an unreachable/bad-step quantity). The DB is the
        -- last line of defence so a direct/corrupted write can't bypass the runtime rule.
        and (max_qty - min_qty) % qty_step = 0
      );
  end if;
end $$;

-- =====================================================================
-- §P0-3  DESIGN MODE DOMAIN
-- ---------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'configurations_design_mode_chk') then
    alter table public.configurations
      add constraint configurations_design_mode_chk
        check (design_mode in ('bugo_creates','ready_file'));
  end if;
end $$;

-- =====================================================================
-- §P0-1 / §P0-5  OWNERSHIP-TOKEN PER-CONFIGURATION CHECKOUT LEASE
-- ---------------------------------------------------------------------
-- Two concurrent finalizeCheckout calls for the SAME configuration must never both create a
-- payable draft. claim_config_checkout() takes the decision under a single row lock and returns a
-- FRESH TOKEN only to the caller that now owns the lease; everyone else gets NULL. release_config_
-- checkout() only clears the lease when the supplied token still matches the current owner — so a
-- request whose lease already expired (and was re-granted to a newer request) CANNOT release the
-- newer owner's lock. Correctness does not depend on checkout completing within the TTL.
alter table public.configurations add column if not exists checkout_lock_at timestamptz;
alter table public.configurations add column if not exists checkout_lock_token uuid;

-- Drop any prior-signature functions (the broken 0021 returned boolean / took (uuid)).
drop function if exists claim_config_checkout(uuid, integer);
drop function if exists release_config_checkout(uuid);
drop function if exists release_config_checkout(uuid, uuid);

-- Returns the new lease token (uuid) to the caller that acquires/reclaims the lease, or NULL when
-- the configuration does not exist or a still-valid lease is held by someone else.
create or replace function claim_config_checkout(p_config_id uuid, p_lease_seconds int default 90)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_locked timestamptz; v_new uuid;
begin
  select checkout_lock_at into v_locked
    from public.configurations
    where id = p_config_id
    for update;
  if not found then
    return null;                                        -- unknown configuration: nothing to lease
  end if;
  -- Held by a still-valid lease from another in-flight finalize → refuse (no token).
  if v_locked is not null and v_locked > now() - make_interval(secs => p_lease_seconds) then
    return null;
  end if;
  -- Free, or the previous lease has expired → take it and mint a NEW ownership token.
  v_new := gen_random_uuid();                           -- built-in since PG13 (pg_catalog)
  update public.configurations
     set checkout_lock_at = now(), checkout_lock_token = v_new
   where id = p_config_id;
  return v_new;
end $$;

-- Releases the lease ONLY when p_token matches the CURRENT owner. A stale owner's token no longer
-- matches (a newer claim replaced it), so this is a safe no-op for stale owners (§P0-5).
create or replace function release_config_checkout(p_config_id uuid, p_token uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  update public.configurations
     set checkout_lock_at = null, checkout_lock_token = null
   where id = p_config_id
     and checkout_lock_token = p_token;
end $$;

-- §P0-2 REVALIDATE + RENEW. Before a payment-critical transition (creating a payable draft), the
-- server re-checks that it STILL owns the lease and extends the TTL in one atomic, row-locked step.
-- Returns true ONLY when p_token still matches the current owner (and then resets checkout_lock_at
-- so the operation completes inside a fresh window). Returns false when the configuration is gone,
-- the lease was cleared, or a NEWER request reclaimed it (token changed) — the caller then aborts
-- WITHOUT creating another payable draft. This closes the "A's TTL expired, B reclaimed, A keeps
-- working" overlap that token-ownership alone did not prevent.
drop function if exists renew_config_checkout(uuid, uuid, integer);
create or replace function renew_config_checkout(p_config_id uuid, p_token uuid, p_lease_seconds int default 120)
returns boolean language plpgsql security definer set search_path = '' as $$
declare v_token uuid;
begin
  select checkout_lock_token into v_token
    from public.configurations
    where id = p_config_id
    for update;
  if not found then return false; end if;                 -- configuration gone
  if v_token is null or v_token <> p_token then
    return false;                                          -- ownership lost / reclaimed by a newer request
  end if;
  update public.configurations set checkout_lock_at = now() where id = p_config_id;  -- extend TTL, same token
  return true;
end $$;

-- =====================================================================
-- §P0  EXECUTE LOCKDOWN — service_role ONLY (mirrors the 0016 pattern)
-- ---------------------------------------------------------------------
do $$
declare
  sig text;
  sigs text[] := array[
    'claim_config_checkout(uuid, integer)',
    'release_config_checkout(uuid, uuid)',
    'renew_config_checkout(uuid, uuid, integer)'
  ];
begin
  foreach sig in array sigs loop
    execute format('revoke all on function public.%s from public', sig);
    begin execute format('revoke all on function public.%s from anon', sig); exception when undefined_object then null; end;
    begin execute format('revoke all on function public.%s from authenticated', sig); exception when undefined_object then null; end;
    begin execute format('grant execute on function public.%s to service_role', sig); exception when undefined_object then null; end;
  end loop;
end $$;
