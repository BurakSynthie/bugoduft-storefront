-- Phase 6E-B1 — quantity tiers metadata + free-sample/design-mode flags. ADDITIVE.
-- Does NOT touch 0005–0009. No drops, no reseed. product_price_tiers already exists
-- (0001: product_id, min_qty, unit_price_cents = rate per 1,000 units).

-- tier admin metadata
alter table product_price_tiers add column if not exists is_active boolean not null default true;
alter table product_price_tiers add column if not exists sort_order int not null default 0;
alter table product_price_tiers add column if not exists badge_de text;
alter table product_price_tiers add column if not exists badge_en text;
alter table product_price_tiers add column if not exists badge_fr text;

-- configuration/order flags
alter table configurations add column if not exists free_sample_set boolean not null default false;
-- source is distinguishable for later credit rules: 'free_5k' must NOT earn sample credit (6E-B2)
alter table configurations add column if not exists free_sample_source text;
alter table configurations add column if not exists design_mode text not null default 'bugo_creates';
alter table configurations add column if not exists unit_rate_cents int;

-- storefront needs to read tiers; writes admin-only.
alter table product_price_tiers enable row level security;
drop policy if exists pub_read_price_tiers on product_price_tiers;
create policy pub_read_price_tiers on product_price_tiers for select using (true);
drop policy if exists admin_all_price_tiers on product_price_tiers;
create policy admin_all_price_tiers on product_price_tiers for all using (is_admin()) with check (is_admin());
