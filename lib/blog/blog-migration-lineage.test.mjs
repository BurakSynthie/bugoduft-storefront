// Blog migration LINEAGE guard. Proves:
//   * migrations 0001–0035 are BYTE-FOR-BYTE unchanged (md5 vs the pinned baseline captured
//     from the v1.2.2 release before any Blog work),
//   * exactly one new migration was added for the Blog feature: 0036_blog_cms.sql,
//   * no other .sql file appeared/disappeared in supabase/migrations.
// Run: node lib/blog/blog-migration-lineage.test.mjs
import { readFileSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';

let failures = 0;
const pass = (m) => console.log('PASS ' + m);
const fail = (m) => { console.log('FAIL ' + m); failures++; };
const md5 = (p) => createHash('md5').update(readFileSync(p)).digest('hex');

// Pinned baseline md5 of the protected chain 0001–0035 (from the v1.2.2 source of truth).
const BASELINE = {
  '0001_init.sql': '6d213c3f94bccc1b6ffc3a80ade85591',
  '0002_seed.sql': 'f49a4b205db24b3f290363c36d7d9ae4',
  '0003_configurations.sql': '91aacd0f6f9cd23fb829b0a79a093cea',
  '0004_admin_orders.sql': '5dd212c43c2d7f8253e47cbb841113ce',
  '0005_product_cms_media.sql': '684b894ef98d07205e4ff506442339d8',
  '0006_cms_media_storage.sql': 'acd440c9cbe17c3eaccf0ec90bf24d4a',
  '0007_scents_promo_second_scent.sql': '70140b4f7faff452fa108f2138f067ac',
  '0008_site_settings_quotes.sql': '5ba435f2d8488cf35da316cba5c6b79b',
  '0009_customer_accounts.sql': 'f15a23c345c82893dd9c45cc0bcf0a11',
  '0010_quantity_tiers.sql': '6539c17d4acf3e4320d45288de36891f',
  '0011_site_settings_repair.sql': 'a52cd6d9b8da9e4de58048f435ddfda0',
  '0012_forty_fragrances.sql': '5ff9e99225dc3bc925a04f71337961d1',
  '0013_sample_credit_and_benefits.sql': '7f67bf1d0c3ff14c17863ee220de2783',
  '0014_reorder_and_admin_detail.sql': 'ffaa3faf840c67947a007ae752d4aaaf',
  '0015_commerce_hardening.sql': '19e7c7d45240b2e7c433804b2663075a',
  '0016_rpc_lockdown_and_webhook_lock.sql': 'f4be5ab0674feb0b2140493b420020aa',
  '0017_de_fragrance_names.sql': '6b8f75cd9ab17095b9fe2a22f806dd76',
  '0018_scent_availability_baseline.sql': '8d77f48df2df789a4c4a68419bf4cbe7',
  '0019_deactivate_legacy_scents.sql': '9b9ac8b41c68f1abb510c085ac5bf0a6',
  '0020_product_scents_admin_rls.sql': '208c18d8d1aded7b964498b963628a01',
  '0021_checkout_lease_and_envelope_checks.sql': '305abbb7900bea5ed7f9c1db951682fa',
  '0022_orphan_reconcile_and_atomic_product_save.sql': '08d63b76a207f0455a47dffbf2b5c91c',
  '0023_benefit_revert_and_email_normalization.sql': '18a2d5d1a82e05527351c92b6bf5c8b6',
  '0024_customer_identity_lockdown.sql': '2674d3595b142af8b66eca60a16f55bc',
  '0025_customer_verified_identity_marker.sql': '091155845ca78e90d60a2c0c3e67dea6',
  '0026_webhook_reconciliation_and_amount_verify.sql': '61973e6079980ca71962404846d925bc',
  '0027_checkout_intent_idempotency.sql': '899bea5fc21f6b5311eef8fdd2aacc0c',
  '0028_checkout_ownership_and_benefit_risk.sql': '30eaae64d8874187f7081554cc78acf8',
  '0029_checkout_state_machine_final.sql': '06c3fb6c562946536918926bd8eab2e5',
  '0030_checkout_state_machine_closure.sql': 'e885850cba5e0371f2d4bbd74c8e0268',
  '0031_checkout_v4_wiring_fix.sql': '0646dfef81602213db0b7e18de9c73b5',
  '0032_checkout_canonical_persist_fix.sql': '6d010baaa25898b3e9dc2830bd00cd69',
  '0033_launch_admin_brand_seo.sql': '8fa8634187cc8c4451eabed9d8596c68',
  '0034_final_launch_technical_closeout.sql': '596f70dbaf94af84d614377652f23052',
  '0035_quote_permissions_final_fix.sql': '8c1ff6afb5cfba0056b0ab4f6d3541ce',
};

const DIR = 'supabase/migrations';
const files = readdirSync(DIR).filter(f => f.endsWith('.sql')).sort();

// 1) every protected file is byte-for-byte identical to the pinned baseline.
for (const [name, expected] of Object.entries(BASELINE)) {
  const actual = md5(`${DIR}/${name}`);
  (actual === expected) ? pass(`${name} unchanged`) : fail(`${name} CHANGED (expected ${expected}, got ${actual})`);
}

// 2) 0036 exists.
files.includes('0036_blog_cms.sql')
  ? pass('0036_blog_cms.sql present')
  : fail('0036_blog_cms.sql MISSING');

// 3) exactly one file beyond the baseline chain, and it is 0036.
const extra = files.filter(f => !(f in BASELINE));
(extra.length === 1 && extra[0] === '0036_blog_cms.sql')
  ? pass('exactly one migration added (0036_blog_cms.sql) — nothing else')
  : fail('unexpected migration set beyond baseline: ' + JSON.stringify(extra));

// 4) no baseline file went missing.
const missing = Object.keys(BASELINE).filter(f => !files.includes(f));
(missing.length === 0) ? pass('no protected migration removed') : fail('missing protected migrations: ' + JSON.stringify(missing));

console.log(failures === 0 ? '\nALL BLOG MIGRATION-LINEAGE TESTS PASSED' : `\n${failures} LINEAGE TEST(S) FAILED`);
process.exit(failures ? 1 : 0);
