-- 0032 — §OPTION-3-v4.2 CANONICAL FINALIZE PERSIST FIX. Additive forward migration (production is
-- 0001–0020 only; 0021–0031 not yet applied). Fixes two launch-blocking V4.1 integration defects in
-- persist_config_checkout_owned WITHOUT editing deployed migrations. Service-role only; search_path
-- pinned empty. This REPLACES the 0031 definition (CREATE OR REPLACE, same name, WIDER signature).
--
-- Defect 1 — REAL-SCHEMA config_status enum. configurations.status is public.config_status (0003),
-- not text. 0031 assigned a text param via `status = coalesce(p_status, status)`, which relied on an
-- implicit text→enum assignment that the real enum schema rejects (masked only because the PGlite
-- harness modelled status as TEXT — the same class of bug previously seen with sample_orders.locale).
-- We now cast explicitly with a CASE (null → leave unchanged; else p_status::public.config_status).
--
-- Defect 2 — canonical finalize-field parity. The removed token-UNGATED finalize upsert persisted the
-- FULL canonical checkout state (…cfg, …adjusted, …paths, status). The 0031 RPC dropped payment/
-- fulfilment-critical fields (supporting artwork JSON, base/surcharge/unit_rate pricing, free-sample
-- flags, auth_user_id). Those must be persisted in the SAME checkout-token-owned atomic write — never
-- via a reintroduced ungated upsert. supporting is fulfilment-critical: admin order detail reads
-- configurations.supporting, and additional artwork uploaded after beginCheckout must not vanish.
--
-- Omit-vs-clear semantics preserved:
--   artwork paths (front_path/back_path): NULL param → leave unchanged; '' → explicit clear (NULL col);
--                                         non-empty string → set that path.
--   supporting (jsonb NOT NULL default '[]'): NULL param → leave unchanged; a jsonb value → replace
--                                             (pass '[]'::jsonb to explicitly clear).
--   status (enum): NULL param → leave unchanged; else cast to public.config_status.
--   auth_user_id / benefit_type / sample_order_id: written as given (final authoritative identity/
--                                                   benefit — these are set by the finalize snapshot).

drop function if exists persist_config_checkout_owned(uuid, uuid, text, int, int, int, text, int, uuid, text, text, jsonb);
create or replace function persist_config_checkout_owned(
  p_config_id uuid, p_token uuid, p_status text,
  p_base_price_cents int, p_surcharge_cents int, p_total_price_cents int, p_unit_rate_cents int,
  p_pre_benefit_total_cents int, p_savings_cents int,
  p_benefit_type text, p_benefit_amount_cents int, p_sample_order_id uuid,
  p_free_sample_set boolean, p_free_sample_source text, p_auth_user_id uuid,
  p_front_path text default null, p_back_path text default null,
  p_supporting jsonb default null, p_snapshot jsonb default null
) returns boolean language plpgsql security definer set search_path = '' as $$
declare v_rows int;
begin
  update public.configurations
     set status = case when p_status is null then status
                       else p_status::public.config_status end,
         base_price_cents        = coalesce(p_base_price_cents, base_price_cents),
         surcharge_cents         = coalesce(p_surcharge_cents, surcharge_cents),
         total_price_cents       = coalesce(p_total_price_cents, total_price_cents),
         unit_rate_cents         = coalesce(p_unit_rate_cents, unit_rate_cents),
         pre_benefit_total_cents = coalesce(p_pre_benefit_total_cents, pre_benefit_total_cents),
         savings_cents           = coalesce(p_savings_cents, savings_cents),
         benefit_type            = p_benefit_type,
         benefit_amount_cents    = coalesce(p_benefit_amount_cents, 0),
         sample_order_id         = p_sample_order_id,
         free_sample_set         = coalesce(p_free_sample_set, free_sample_set),
         free_sample_source      = p_free_sample_source,
         auth_user_id            = p_auth_user_id,
         front_path = case when p_front_path is null then front_path
                           when p_front_path = '' then null else p_front_path end,
         back_path  = case when p_back_path is null then back_path
                           when p_back_path = '' then null else p_back_path end,
         supporting = case when p_supporting is null then supporting else p_supporting end,
         checkout_snapshot = coalesce(p_snapshot, checkout_snapshot)
   where id = p_config_id and checkout_lock_token = p_token;
  get diagnostics v_rows = row_count;
  return v_rows = 1;
end $$;

-- ============================ grants: service-role only ============================
do $$
declare fn text;
begin
  foreach fn in array array[
    'persist_config_checkout_owned(uuid,uuid,text,int,int,int,int,int,int,text,int,uuid,boolean,text,uuid,text,text,jsonb,jsonb)'
  ] loop
    execute format('revoke all on function %s from public', fn);
    begin execute format('revoke all on function %s from anon', fn); exception when undefined_object then null; end;
    begin execute format('revoke all on function %s from authenticated', fn); exception when undefined_object then null; end;
    execute format('grant execute on function %s to service_role', fn);
  end loop;
end $$;
