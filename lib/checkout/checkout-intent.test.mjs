// §OPTION-3 EXECUTE-level tests for the durable checkout-intent idempotency state machine,
// against a real Postgres (PGlite 16.4). Loads the ACTUAL RPC bodies from migration 0027.
// Proves the crash-window invariant: one subject → at most one recoverable payable draft.
// Run: node lib/checkout/checkout-intent.test.mjs
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';

let failures = 0;
const pass = (m) => console.log('PASS ' + m);
const fail = (m) => { console.log('FAIL ' + m); failures++; };
const db = await PGlite.create();
const q = async (sql, p) => (await db.query(sql, p)).rows;
const begin = async (subj, token, extra = {}) => (await q(
  `select begin_checkout_intent($1,$2,$3,$4,$5,$6,$7,$8,$9) v`,
  [subj, token, extra.source ?? 'main_checkout', extra.sample ?? null, extra.bt ?? null,
   extra.bc ?? 0, extra.total ?? 26900, extra.cur ?? 'EUR', extra.stale ?? 120]))[0].v;
const attach = async (subj, token, draft) => (await q(`select attach_checkout_intent_draft($1,$2,$3) v`, [subj, token, draft]))[0].v;
const resolve = async (subj, token, status) => (await q(`select resolve_checkout_intent($1,$2,$3) v`, [subj, token, status]))[0].v;
const draftOf = async (subj) => (await q(`select shopify_draft_order_id d from checkout_intents where config_id=$1`, [subj]))[0]?.d ?? null;

await db.exec(`
  do $$ begin create role anon; exception when duplicate_object then null; end $$;
  do $$ begin create role authenticated; exception when duplicate_object then null; end $$;
  do $$ begin create role service_role; exception when duplicate_object then null; end $$;
`);
await db.exec(readFileSync('supabase/migrations/0027_checkout_intent_idempotency.sql', 'utf8'));

const S1 = '11111111-1111-4111-8111-111111111111';
const TA = 'aaaaaaaa-1111-4111-8111-111111111111';
const TB = 'bbbbbbbb-2222-4222-8222-222222222222';

// (1) NORMAL FIRST CHECKOUT → 'created' → attach → resolve.
(await begin(S1, TA)) === 'created' ? pass('§1 first checkout → created') : fail('§1 not created');
(await attach(S1, TA, 'gid://draft/1')) === true ? pass('§1 attach draft id') : fail('§1 attach failed');
(await resolve(S1, TA, 'resolved')) === true ? pass('§1 resolve on success') : fail('§1 resolve failed');

// (2) SAME SUBJECT IMMEDIATE RETRY after resolve → safe to create again (clean prior).
(await begin(S1, TA)) === 'created' ? pass('§2 retry after resolved → created (clean)') : fail('§2 retry not clean');

// (3) SHOPIFY CREATE OK, DB PERSIST FAILS: intent has draft_created + id, retry sees existing_draft.
const S3 = '33333333-3333-4333-8333-333333333333';
await begin(S3, TA);
await attach(S3, TA, 'gid://draft/3');          // create succeeded, id attached...
// ...simulate persist failure by NOT resolving; a retry now:
(await begin(S3, TA)) === 'existing_draft' ? pass('§3 persist-fail retry → existing_draft (delete-confirm, no blind create)') : fail('§3 retry blindly created');
(await draftOf(S3)) === 'gid://draft/3' ? pass('§3 recorded draft id recoverable for delete-confirm') : fail('§3 draft id lost');

// (4) HARD PROCESS DEATH before attach: intent is 'draft_pending' with NO draft id.
//     A retry MUST get 'unknown_pending' → FAIL CLOSED (a Shopify draft may exist unseen).
const S4 = '44444444-4444-4444-8444-444444444444';
await begin(S4, TA);                             // pre-create marker written...
// ...process dies here (Shopify draft may or may not exist; attach never ran). Retry (stale):
(await begin(S4, TA, { stale: 0 })) === 'unknown_pending'
  ? pass('§4 hard crash (pending, no draft id) → unknown_pending (fail closed, no blind create)')
  : fail('§4 crash window not fail-closed');

// (5) UNRESOLVED intent with a draft id blocks a new payable draft (must recover, not create).
const S5 = '55555555-5555-4555-8555-555555555555';
await begin(S5, TA); await attach(S5, TA, 'gid://draft/5');
(await begin(S5, TB)) === 'existing_draft' ? pass('§5 unresolved draft blocks new create (existing_draft)') : fail('§5 new draft not blocked');

// (7) STALE token A vs current owner B: A cannot advance/clear B's intent.
const S7 = '77777777-7777-4777-8777-777777777777';
await begin(S7, TB);                             // B owns a fresh pending intent
(await begin(S7, TA, { stale: 120 })) === 'not_owner' ? pass('§7 stale A sees B live intent → not_owner') : fail('§7 stale A not blocked');
(await attach(S7, TA, 'gid://draft/hack')) === false ? pass('§7 stale A cannot attach to B intent') : fail('§7 stale A attached');
(await resolve(S7, TA, 'resolved')) === false ? pass('§7 stale A cannot resolve B intent') : fail('§7 stale A resolved');
(await draftOf(S7)) === null ? pass('§7 B intent untouched by A') : fail('§7 B intent mutated by A');

// (9) CONFIRMED prior draft deletion → superseded → safe replacement create.
const S9 = '99999999-9999-4999-8999-999999999999';
await begin(S9, TA); await attach(S9, TA, 'gid://draft/9');
(await resolve(S9, TA, 'superseded')) === true ? pass('§9 confirmed-delete → superseded') : fail('§9 supersede failed');
(await begin(S9, TA)) === 'created' ? pass('§9 after supersede → safe replacement create') : fail('§9 replacement blocked');

// (10) DUPLICATE CONCURRENT attempts: first begin owns pending; a second live token → not_owner.
const S10 = '10101010-1010-4010-8010-101010101010';
(await begin(S10, TA)) === 'created' ? pass('§10 concurrent A → created (owns pending)') : fail('§10 A not owner');
(await begin(S10, TB, { stale: 120 })) === 'not_owner' ? pass('§10 concurrent B → not_owner (one active draft invariant)') : fail('§10 B allowed to create');

// (11) SAMPLE path uses the SAME machine keyed by sample_orders.id, source=sample_checkout.
const SS = 'aaaa1111-1111-4111-8111-111111111111';
(await begin(SS, TA, { source: 'sample_checkout', sample: SS, total: 4000 })) === 'created' ? pass('§11 sample first → created') : fail('§11 sample not created');
await attach(SS, TA, 'gid://draft/sample');
(await begin(SS, TA, { source: 'sample_checkout', sample: SS, total: 4000 })) === 'existing_draft' ? pass('§11 sample retry → existing_draft (same idempotency)') : fail('§11 sample retry blind create');

// (6) BENEFIT + ORPHAN: an unresolved discounted draft (benefit recorded on the intent) is
//     'existing_draft' on retry — the caller must delete-confirm the payable draft before reusing
//     the benefit, so a one-time benefit is never silently reusable while a payable draft stands.
const S6 = '66666666-6666-4666-8666-666666666666';
await begin(S6, TA, { bt: 'first_order_5pct', bc: 1345, total: 25555 });
await attach(S6, TA, 'gid://draft/6');
const d6 = (await begin(S6, TB)) ;
d6 === 'existing_draft' ? pass('§6 discounted unresolved draft → existing_draft (benefit not free-reusable via new create)') : fail('§6 benefit reusable state=' + d6);
const bt6 = (await q(`select benefit_type b from checkout_intents where config_id=$1`, [S6]))[0].b;
bt6 === 'first_order_5pct' ? pass('§6 benefit type retained on intent for reconciliation') : fail('§6 benefit type lost');

// (8) DELETION TIMEOUT/UNKNOWN semantics: the state machine never advances a pending/existing
//     intent to a terminal clean state on its own — only an explicit resolve('superseded') after a
//     CONFIRMED delete frees replacement. An unresolved 'existing_draft' stays blocking.
const S8 = '88888888-8888-4888-8888-888888888888';
await begin(S8, TA); await attach(S8, TA, 'gid://draft/8');
// caller's deleteDraftOrder timed out → does NOT call resolve('superseded'); retry still blocked:
(await begin(S8, TA)) === 'existing_draft' ? pass('§8 delete timeout (no supersede) → still existing_draft, no replacement create') : fail('§8 replacement created after timeout');

console.log(failures === 0 ? '\nALL CHECKOUT-INTENT TESTS PASSED' : `\n${failures} CHECKOUT-INTENT TEST(S) FAILED`);
process.exit(failures ? 1 : 0);
