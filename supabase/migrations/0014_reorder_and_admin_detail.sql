-- Completion pass §9/§15 — additive only. Does NOT touch 0001-0013.
--
-- §9 secure reorder-artwork reuse: traceability column only. The reorder flow
-- (repositories/reorder.ts) always INSERTs a brand-new configurations row (fresh id) via
-- the existing finalizeCheckout() path and never mutates the source order/configuration;
-- this column just records which prior configuration a reorder's artwork/settings were
-- copied from, for the customer's own reference and for admin order-detail display (§15).
alter table configurations add column if not exists reused_from_configuration_id uuid references configurations(id) on delete set null;
create index if not exists idx_configurations_reused_from on configurations(reused_from_configuration_id);
