-- BUGO DUFT — §P0-5 product_scents admin RLS. ADDITIVE, idempotent, NON-destructive.
-- Admin → Kokular availability save writes product_scents with the authenticated admin
-- session; without an admin write policy the insert fails with
--   "new row violates row-level security policy for table product_scents".
-- This adds the permanent policy so a fresh/staging DB does not reproduce the bug.
-- RLS stays ENABLED; customer/public security is unchanged (no public write is granted).
alter table public.product_scents enable row level security;

drop policy if exists admin_all_product_scents on public.product_scents;

create policy admin_all_product_scents
  on public.product_scents
  for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());
