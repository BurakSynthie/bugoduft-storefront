-- Phase 6C — promotional pricing + second (free) scent + scents CMS + admin write RLS.
-- ADDITIVE and backward compatible. Does NOT touch 0005/0006. No drops, no reseed,
-- no data reset. Existing products/configurations/orders/media/CMS all preserved.

-- ---------------- promotional / compare-at pricing (DISPLAY ONLY) ----------------
-- Checkout price stays authoritative server-side; these fields are shown struck-through
-- only. compare_at is a manually entered legal reference price (see admin help text).
alter table products add column if not exists compare_at_cents int;
alter table products add column if not exists promo_enabled boolean not null default false;
alter table products add column if not exists promo_start timestamptz;
alter table products add column if not exists promo_end   timestamptz;
alter table product_translations add column if not exists promo_badge text;

-- ---------------- second, optional, FREE scent ----------------
-- Nullable → existing single-scent configurations remain valid. Never affects price.
alter table configurations add column if not exists scent_code_2 text;

-- ---------------- scents CMS fields ----------------
alter table scents add column if not exists sort_order int not null default 0;
alter table scents add column if not exists featured  boolean not null default false;
alter table scents add column if not exists updated_at timestamptz not null default now();

-- ---------------- admin write RLS for catalog CMS ----------------
-- 0001 left catalog writes blocked until is_admin() existed (added in 0004). These
-- policies enable admin-only writes via the RLS session; public read policies are
-- unchanged. Idempotent (drop-if-exists), safe to run once.
do $$
declare t text;
begin
  foreach t in array array['products','product_translations','collections','collection_translations','scents','scent_translations']
  loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists admin_all_%s on %I', t, t);
    execute format('create policy admin_all_%s on %I for all using (is_admin()) with check (is_admin())', t, t);
  end loop;
end $$;
