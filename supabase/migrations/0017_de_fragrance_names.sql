-- BUGO DUFT — §P1 German fragrance-name correction. ADDITIVE, idempotent.
-- Migration 0012 stored several TURKISH names in the German (locale='de') translation
-- rows. This corrects them to natural German. It is GUARDED: each row updates only when
-- the German name STILL equals the original Turkish seed value, so any name an admin has
-- already edited via Admin -> Kokular is never overwritten. Re-running is a no-op.
-- EN/FR are already correct and are left untouched. Descriptions were already German.
-- Brand/proper names (One Million, Black Ice, Sauvage, Bleu de Chanel, Woody, Rain Forest,
-- Jeune France, Hollywood, Areon Vanilla, Little Trees …) are intentionally NOT translated.

update scent_translations t
   set name = c.new_name
  from (values
    ('std-okyanus',  'Okyanus',                  'Ozean'),
    ('std-sakiz',    'Sakız',                    'Kaugummi'),
    ('std-portakal', 'Portakal',                 'Orange'),
    ('std-cilek',    'Çilek',                    'Erdbeere'),
    ('std-limon',    'Limon',                    'Zitrone'),
    ('std-bahar',    'Bahar',                    'Frühlingsblüte'),
    ('std-mentol',   'Mentol',                   'Menthol'),
    ('std-hanimeli', 'Hanımeli',                 'Geißblatt'),
    ('std-elma',     'Elma',                     'Apfel'),
    ('std-lavanta',  'Lavanta',                  'Lavendel'),
    ('std-vanilya',  'Vanilya',                  'Vanille'),
    ('std-bogurtlen','Blackberry / Böğürtlen',   'Brombeere'),
    ('std-latte',    'Latte / Sütlü Kahve',      'Latte Macchiato'),
    ('std-cam',      'Çam',                      'Kiefer'),
    ('std-kavun',    'Kavun',                    'Melone'),
    ('std-tropik',   'Tropik Meyve',             'Tropische Früchte'),
    ('std-burcu',    'Burcu / Dove',             'Seifenfrisch'),
    ('std-sakura',   'Kiraz Çiçeği / Sakura',    'Kirschblüte'),
    ('prf-bambu',    'Bambu',                    'Bambus')
  ) as c(code, old_name, new_name)
  join scents s on s.code = c.code
 where t.scent_id = s.id
   and t.locale = 'de'
   and t.name = c.old_name;
