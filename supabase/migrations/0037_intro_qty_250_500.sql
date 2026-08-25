-- BUGO DUFT — §INTRO-250-500 — two fixed intro entry points (250 & 500 units) for the four
-- variants (Standard / Premium / Deluxe / VIP). ADDITIVE and idempotent. Does NOT touch the
-- existing 1.000 ladder, does NOT open any intermediate quantity (750 / 1.250 / 1.500 …), and
-- does NOT alter products_qty_envelope_chk (0021) — product min/max/step stay 1.000.
--
-- Two things happen here:
--   1. Relax the configurations.quantity CHECK (from 0003) so a saved configuration may carry
--      exactly 250 or 500, in addition to the 1.000-block ladder. Nothing else changes.
--   2. Seed the 250- and 500-unit price tiers (rate per 1.000 units) for the four products, so
--      the authoritative pricing path can price an intro order to the exact cent.
--
-- Rounding safety (verified in lib/pricing/tiers.test.ts): total = round(rate × qty / 1000).
--   250 = rate × 0,25  → the 250 rate is divisible by 4  (exact cents)
--   500 = rate × 0,5   → the 500 rate is divisible by 2  (exact cents)

begin;

-- 1) ---------------------------------------------------------------------------------------
-- configurations.quantity CHECK. 0003 created it inline on the column, so Postgres named it
-- `configurations_quantity_check`. Drop defensively (IF EXISTS) and re-add the relaxed form.
alter table public.configurations drop constraint if exists configurations_quantity_check;
alter table public.configurations
  add constraint configurations_quantity_check
  check (
    quantity <= 100000
    and (
      quantity = 250
      or quantity = 500
      or (quantity >= 1000 and quantity % 1000 = 0)
    )
  );

-- 2) ---------------------------------------------------------------------------------------
-- Intro price tiers (min_qty = 250 and min_qty = 500) per product. unit_price_cents is the
-- rate per 1.000 units; the engine multiplies by qty/1000 (250 ⇒ ×0,25, 500 ⇒ ×0,5).
-- product_price_tiers already allows min_qty ≥ 1 (0001 CHECK min_qty > 0), so no schema change
-- is needed on that table. is_active/sort_order/badges come from 0010 (defaults are fine).
-- Idempotent via the (product_id, min_qty) unique key.
--
--   Variant   | 250 rate (¢/1000) → 250 total | 500 rate (¢/1000) → 500 total
--   Standard  | 71600 → 17900 (179,00 €)      | 39800 → 19900 (199,00 €)
--   Premium   | 75600 → 18900 (189,00 €)      | 41800 → 20900 (209,00 €)
--   Deluxe    | 79600 → 19900 (199,00 €)      | 43800 → 21900 (219,00 €)
--   VIP       | 83600 → 20900 (209,00 €)      | 45800 → 22900 (229,00 €)

insert into product_price_tiers (product_id, min_qty, unit_price_cents, is_active, sort_order)
select p.id, v.min_qty, v.unit_price_cents, true, v.sort_order
from products p
join (values
  ('BUGO-STD', 250, 71600, -2), ('BUGO-STD', 500, 39800, -1),
  ('BUGO-PRM', 250, 75600, -2), ('BUGO-PRM', 500, 41800, -1),
  ('BUGO-DLX', 250, 79600, -2), ('BUGO-DLX', 500, 43800, -1),
  ('BUGO-VIP', 250, 83600, -2), ('BUGO-VIP', 500, 45800, -1)
) as v(product_code, min_qty, unit_price_cents, sort_order)
  on v.product_code = p.product_code
on conflict (product_id, min_qty)
  do update set unit_price_cents = excluded.unit_price_cents,
                is_active        = true,
                sort_order       = excluded.sort_order;

commit;

-- Verification (run manually against preview after applying):
--   \d configurations           -- confirm the relaxed configurations_quantity_check
--   -- 250/500 accepted, 750/1.250 rejected:
--   -- insert ... quantity = 250  → OK ; quantity = 750 → CHECK violation
--   select p.product_code, t.min_qty, t.unit_price_cents
--     from product_price_tiers t join products p on p.id = t.product_id
--    where t.min_qty in (250,500) order by p.product_code, t.min_qty;
--   -- products_qty_envelope_chk is UNCHANGED (still min/max/step = 1.000):
--   select conname from pg_constraint where conname = 'products_qty_envelope_chk';
