-- BUGO DUFT — Final repair pass, part 2. ADDITIVE ONLY.
-- Does NOT modify 0001–0021. Every statement is idempotent / re-runnable. Covers:
--   §P0-3/§HIGH-9  checkout_orphan_drafts reconciliation table — records a Shopify draft (payable
--                  invoice) whose DB persistence failed AND whose deletion could not be confirmed,
--                  so the draft id is never lost and no second discounted invoice is issued.
--   §HIGH-10       admin_save_product() — a single-transaction, admin-gated RPC that saves product
--                  core + translations + gallery + price tiers ATOMICALLY (all-or-nothing), so a
--                  failure after the core update can never leave partial translations/gallery/tiers.
--
-- Apply AFTER 0021.

-- =====================================================================
-- §P0-3 / §HIGH-9  ORPHAN-RISK DRAFT RECONCILIATION
-- ---------------------------------------------------------------------
create table if not exists public.checkout_orphan_drafts (
  id uuid primary key default gen_random_uuid(),
  shopify_draft_order_id text not null,
  source text not null check (source in ('main_checkout','sample_checkout')),
  config_id uuid references public.configurations(id) on delete set null,
  sample_order_id uuid references public.sample_orders(id) on delete set null,
  benefit_type text check (benefit_type is null or benefit_type in ('sample_credit','first_order_5pct')),
  benefit_amount_cents int,
  auth_user_id uuid references auth.users(id) on delete set null,
  reason text not null,
  status text not null default 'open' check (status in ('open','resolved')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_orphan_drafts_status on public.checkout_orphan_drafts(status);

do $$ begin
  create trigger t_checkout_orphan_drafts_u before update on public.checkout_orphan_drafts
    for each row execute function set_updated_at();
exception when duplicate_object then null; end $$;

alter table public.checkout_orphan_drafts enable row level security;
drop policy if exists admin_all_orphan_drafts on public.checkout_orphan_drafts;
create policy admin_all_orphan_drafts on public.checkout_orphan_drafts for all using (is_admin()) with check (is_admin());
-- No anon/customer policy: written only by service-role checkout/sample code; read by admins.

-- =====================================================================
-- §HIGH-10  ATOMIC ADMIN PRODUCT SAVE
-- ---------------------------------------------------------------------
-- One transaction: product core + translations (upsert) + gallery (replace) + price tiers
-- (replace). Any failure raises → the WHOLE transaction rolls back (all-or-nothing). Security:
--   • SECURITY DEFINER with a LOCKED empty search_path and fully public.-qualified identifiers
--     (no search_path hijack, no SQL injection via identifier resolution).
--   • Verifies public.is_admin() FIRST and raises 'not_admin' otherwise — the definer rights are
--     NOT usable by a non-admin authenticated caller.
--   • §P0/HIGH-12 re-checks the tier-coverage invariant (an ACTIVE tier must cover min_qty).
-- EXECUTE is granted to `authenticated` (gated by is_admin() inside) and `service_role`; the
-- default PUBLIC grant and anon are revoked. This does NOT weaken RLS: it is a controlled,
-- admin-only mutation surface, not a service-role bypass exposed to arbitrary users.
create or replace function admin_save_product(
  p_product_code text,
  p_product jsonb,
  p_translations jsonb,
  p_gallery_ids jsonb,
  p_tiers jsonb
) returns void language plpgsql security definer set search_path = '' as $$
declare
  v_pid uuid;
  v_min int;
  v_max int;
  v_step int;
  t jsonb;
  g text;
  i int := 0;
begin
  -- §HIGH-10 AUTHORIZATION — admin only.
  if not public.is_admin() then
    raise exception 'not_admin';
  end if;

  select id into v_pid from public.products where product_code = p_product_code;
  if v_pid is null then
    raise exception 'product_not_found';
  end if;

  v_min  := (p_product->>'min_qty')::int;
  v_max  := (p_product->>'max_qty')::int;
  v_step := (p_product->>'qty_step')::int;

  -- §HIGH-4 QUANTITY INVARIANT enforced INSIDE the transaction (not only in TypeScript). The
  -- runtime rule is step-from-min: a quantity is valid iff (quantity - min) % step = 0, so max
  -- must itself be reachable — (max - min) % step = 0. Reject any incoherent rule set so the DB
  -- and runtime can never disagree. (The products_qty_envelope_chk in 0021 also enforces this on
  -- the UPDATE below; this explicit check gives a clear error and blocks before any mutation.)
  if v_min is null or v_max is null or v_step is null
     or v_min <= 0 or v_step <= 0 or v_max < v_min
     or (v_max - v_min) % v_step <> 0 then
    raise exception 'invalid_qty_rules';
  end if;

  -- §P0/HIGH-12 TIER COVERAGE: at least one ACTIVE tier with min_qty <= product min_qty.
  if not exists (
    select 1 from jsonb_array_elements(coalesce(p_tiers, '[]'::jsonb)) e
    where coalesce((e->>'is_active')::boolean, true) = true
      and (e->>'min_qty')::int <= v_min
  ) then
    raise exception 'no_active_tier_covers_min_qty';
  end if;

  -- ---- product core ----
  update public.products set
    is_active        = coalesce((p_product->>'is_active')::boolean, is_active),
    sort_order       = coalesce((p_product->>'sort_order')::int, 0),
    base_price_cents = (p_product->>'base_price_cents')::int,
    min_qty          = (p_product->>'min_qty')::int,
    qty_step         = (p_product->>'qty_step')::int,
    max_qty          = (p_product->>'max_qty')::int,
    compare_at_cents = nullif(p_product->>'compare_at_cents','')::int,
    promo_enabled    = coalesce((p_product->>'promo_enabled')::boolean, false),
    promo_start      = nullif(p_product->>'promo_start','')::timestamptz,
    promo_end        = nullif(p_product->>'promo_end','')::timestamptz,
    cover_media_id   = nullif(p_product->>'cover_media_id','')::uuid,
    video_media_id   = nullif(p_product->>'video_media_id','')::uuid,
    poster_media_id  = nullif(p_product->>'poster_media_id','')::uuid
  where id = v_pid;

  -- ---- translations (upsert per locale) ----
  for t in select * from jsonb_array_elements(coalesce(p_translations, '[]'::jsonb)) loop
    insert into public.product_translations(
      product_id, locale, name, slug, h1, short_desc, long_desc, seo_title, seo_description,
      features, use_case, production_info, delivery_info, moq_text, badge, promo_badge
    ) values (
      v_pid, (t->>'locale')::public.locale, t->>'name', t->>'slug', t->>'h1',
      t->>'short_desc', t->>'long_desc', t->>'seo_title', t->>'seo_description',
      coalesce((select array(select jsonb_array_elements_text(coalesce(t->'features','[]'::jsonb)))), '{}'::text[]),
      t->>'use_case', t->>'production_info', t->>'delivery_info',
      t->>'moq_text', t->>'badge', t->>'promo_badge'
    )
    on conflict (product_id, locale) do update set
      name = excluded.name, slug = excluded.slug, h1 = excluded.h1,
      short_desc = excluded.short_desc, long_desc = excluded.long_desc,
      seo_title = excluded.seo_title, seo_description = excluded.seo_description,
      features = excluded.features, use_case = excluded.use_case,
      production_info = excluded.production_info, delivery_info = excluded.delivery_info,
      moq_text = excluded.moq_text, badge = excluded.badge, promo_badge = excluded.promo_badge;
  end loop;

  -- ---- gallery (full replace, ordered) ----
  delete from public.product_media where product_id = v_pid and role = 'gallery';
  for g in select * from jsonb_array_elements_text(coalesce(p_gallery_ids, '[]'::jsonb)) loop
    insert into public.product_media(product_id, media_id, role, sort_order)
      values (v_pid, g::uuid, 'gallery', i);
    i := i + 1;
  end loop;

  -- ---- price tiers (full replace) ----
  delete from public.product_price_tiers where product_id = v_pid;
  for t in select * from jsonb_array_elements(coalesce(p_tiers, '[]'::jsonb)) loop
    insert into public.product_price_tiers(
      product_id, min_qty, unit_price_cents, badge_de, badge_en, badge_fr, is_active, sort_order
    ) values (
      v_pid, (t->>'min_qty')::int, (t->>'unit_price_cents')::int,
      nullif(t->>'badge_de',''), nullif(t->>'badge_en',''), nullif(t->>'badge_fr',''),
      coalesce((t->>'is_active')::boolean, true), coalesce((t->>'sort_order')::int, 0)
    );
  end loop;
end $$;

-- EXECUTE lockdown: admin-gated authenticated callers + service_role only; never anon/public.
do $$
begin
  revoke all on function public.admin_save_product(text, jsonb, jsonb, jsonb, jsonb) from public;
  begin execute 'revoke all on function public.admin_save_product(text, jsonb, jsonb, jsonb, jsonb) from anon'; exception when undefined_object then null; end;
  begin execute 'grant execute on function public.admin_save_product(text, jsonb, jsonb, jsonb, jsonb) to authenticated'; exception when undefined_object then null; end;
  begin execute 'grant execute on function public.admin_save_product(text, jsonb, jsonb, jsonb, jsonb) to service_role'; exception when undefined_object then null; end;
end $$;
