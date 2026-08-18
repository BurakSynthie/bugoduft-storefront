-- BUGO DUFT — §P1 scent availability BASELINE. ADDITIVE, idempotent.
-- Migration 0012 inserted RESTRICTIVE product_scents associations (not every scent on
-- every product). For the initial BUGO configuration the intended state is: all active
-- commercial scents are available on all four main products (Standard/Premium/Deluxe/VIP).
-- This inserts the missing associations. It only ADDS (on conflict do nothing) — it never
-- removes an association, so it does not fight the admin. After this baseline, the Admin ->
-- Kokular availability matrix (product_scents) is authoritative; admin removals are honored
-- and are NOT re-added by this one-time migration under normal (apply-once) migration flow.
insert into product_scents (product_id, scent_id)
select p.id, s.id
  from products p
  join collections col on col.id = p.collection_id
  cross join scents s
 where col.code in ('STANDARD','PREMIUM','DELUXE','VIP')
   and p.is_active = true
   and s.is_active = true
on conflict (product_id, scent_id) do nothing;
