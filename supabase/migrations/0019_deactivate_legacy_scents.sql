-- BUGO DUFT — §5 legacy seed-scent cleanup. ADDITIVE, idempotent, NON-destructive.
-- The 0002 bootstrap inserted 10 placeholder scents that now coexist with the real
-- 40-fragrance catalogue (0012). This deactivates ONLY those 10 bootstrap codes so the
-- storefront/configurator (which filter is_active) stop offering them. Rows are kept —
-- never deleted — so historical order/configuration references stay intact. Any admin who
-- deliberately re-activates one later is not overridden on a normal (apply-once) run.
update scents set is_active = false, updated_at = now()
 where code in (
   'frisch-ocean','frisch-cotton','fruchtig-apple','fruchtig-cherry','fruchtig-mango',
   'suess-vanilla','suess-caramel','elegant-black','elegant-oud','intensiv-espresso'
 )
   and is_active = true;

-- Also drop their product availability so a deactivated legacy scent can't linger as a
-- selectable product_scents association (checkout already rejects inactive scents; this
-- keeps the admin availability matrix clean). Real 40-scent associations are untouched.
delete from product_scents ps
 using scents s
 where ps.scent_id = s.id
   and s.code in (
     'frisch-ocean','frisch-cotton','fruchtig-apple','fruchtig-cherry','fruchtig-mango',
     'suess-vanilla','suess-caramel','elegant-black','elegant-oud','intensiv-espresso'
   );
