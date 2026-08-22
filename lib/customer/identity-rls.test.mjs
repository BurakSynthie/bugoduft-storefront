// §P0-1 EXECUTE-level RLS regression test against a REAL Postgres (PGlite 16.4).
//
// This is NOT a mock. It creates the actual Supabase-style roles (anon, authenticated,
// service_role), wires auth.uid() to the JWT `sub` claim exactly as Supabase does
// (current_setting('request.jwt.claim.sub')), applies the REAL customers/orders schema,
// the 0009 self-read policy, and the 0024 lockdown migration, then attacks it.
//
// Proves:
//   1. Authenticated A CANNOT change customers.email (to B's email or anything).
//   2. Authenticated A CANNOT change customers.auth_user_id.
//   3. service_role identity sync (ensureCustomerRow-equivalent) STILL works.
//   4. After the attack attempt, A CANNOT read B's orders (isolation holds).
//   5. Normalized legitimate linking (guest row claim by verified email) STILL works.
//
// Run:  node lib/customer/identity-rls.test.mjs
import { PGlite } from '@electric-sql/pglite';

let failures = 0;
const pass = (m) => console.log('PASS ' + m);
const fail = (m) => { console.log('FAIL ' + m); failures++; };
async function expectThrow(fn, label) {
  try { await fn(); fail(label + ' — expected error but succeeded'); }
  catch { pass(label); }
}
async function expectOk(fn, label) {
  try { await fn(); pass(label); }
  catch (e) { fail(label + ' — unexpected error: ' + (e?.message ?? e)); }
}

const db = await PGlite.create();
const q = async (sql, params) => (await db.query(sql, params)).rows;

// ---- roles Supabase provides ----
await db.exec(`
  do $$ begin create role anon;          exception when duplicate_object then null; end $$;
  do $$ begin create role authenticated; exception when duplicate_object then null; end $$;
  do $$ begin create role service_role;  exception when duplicate_object then null; end $$;
  -- Supabase's service_role has BYPASSRLS; mirror that so the harness matches production.
  alter role service_role bypassrls;
`);

// ---- auth.uid() exactly as Supabase defines it (reads the request JWT 'sub' claim) ----
await db.exec(`
  create schema if not exists auth;
  create or replace function auth.uid() returns uuid
    language sql stable as $$
      select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
    $$;
`);

// ---- real customers + orders schema (from 0001), RLS enabled ----
await db.exec(`
  create table customers (
    id uuid primary key default gen_random_uuid(),
    auth_user_id uuid unique,
    email text not null,
    company text,
    email_verified_at timestamptz,
    created_at timestamptz not null default now()
  );
  create table sample_orders (
    id text primary key,
    email text,
    auth_user_id uuid,
    customer_id uuid,
    credit_used_at timestamptz
  );
  create table orders (
    id uuid primary key default gen_random_uuid(),
    customer_id uuid references customers(id) on delete set null,
    total_cents int not null default 0,
    created_at timestamptz not null default now()
  );
  alter table customers enable row level security;
  alter table orders enable row level security;
  grant select, insert, update, delete on customers to authenticated, service_role;
  grant select, insert, update, delete on orders    to authenticated, service_role;
  grant usage on schema auth to authenticated, anon, service_role;
`);

// ---- 0009 policies (self-read + the VULNERABLE self-update, to prove 0024 closes it) ----
await db.exec(`
  create policy customer_self_read on customers for select using (auth_user_id = auth.uid());
  -- The original 0009 self-update, intentionally applied so the test proves 0024 neutralizes
  -- the column-level poisoning even if such a policy exists:
  create policy customer_self_update on customers for update
    using (auth_user_id = auth.uid()) with check (auth_user_id = auth.uid());
  create policy customer_read_own_orders on orders for select
    using (customer_id in (select id from customers where auth_user_id = auth.uid()));
`);

// ---- apply the 0024 lockdown migration body (drops write policies + installs trigger) ----
import { readFileSync } from 'node:fs';
const m24 = readFileSync('supabase/migrations/0024_customer_identity_lockdown.sql', 'utf8');
await db.exec(m24);
const m25 = readFileSync('supabase/migrations/0025_customer_verified_identity_marker.sql', 'utf8');
await db.exec(m25);

// ---- seed two customers as service_role (authoritative server sync) ----
const A_UID = '11111111-1111-1111-1111-111111111111';
const B_UID = '22222222-2222-2222-2222-222222222222';
await db.exec(`set role service_role`);
const [{ id: A_ID }] = await q(
  `insert into customers(auth_user_id, email) values ($1,'  Alice@Example.COM ') returning id`, [A_UID]);
const [{ id: B_ID }] = await q(
  `insert into customers(auth_user_id, email) values ($1,'bob@example.com') returning id`, [B_UID]);
await q(`insert into orders(customer_id, total_cents) values ($1, 9900)`, [B_ID]); // B's order
await db.exec(`reset role`);

// service_role write normalized A's email on the way in (trigger lowercases/trims):
const aEmail = (await q(`select email from customers where id=$1`, [A_ID]))[0].email;
if (aEmail === 'alice@example.com') pass('§P0-1(3) service_role insert normalized email → alice@example.com');
else fail('§P0-1(3) expected normalized alice@example.com, got "' + aEmail + '"');

// helper: run as authenticated user U with a JWT sub claim set
async function asUser(uid, fn) {
  // is_local=false → session-scoped; persists across PGlite's per-statement autocommit
  // (a transaction-local `true` would vanish before the next query and auth.uid() → null).
  await q(`select set_config('request.jwt.claim.sub', $1, false)`, [uid]);
  await db.exec(`set role authenticated`);
  try { return await fn(); }
  finally { await db.exec(`reset role`); await q(`select set_config('request.jwt.claim.sub','', false)`); }
}

// The attack is blocked at TWO layers: (a) 0024 removes the UPDATE policy, so an
// authenticated caller can update ZERO rows (RLS filters the row out — a silent no-op,
// which for security purposes is a full block); (b) the immutability trigger is a
// backstop that raises if any future migration re-adds a self-update policy.
// The invariant we assert is the SECURITY OUTCOME: no identity mutation occurs.
const affectedRows = async (sql, params) => (await db.query(sql, params)).affectedRows ?? 0;

// (1) A tries to change its email to B's email → row must be UNCHANGED.
await asUser(A_UID, async () => {
  const n = await affectedRows(`update customers set email='bob@example.com' where auth_user_id=$1`, [A_UID]);
  n === 0 ? pass('§P0-1(1) authenticated A CANNOT rewrite its email to B\'s email (0 rows affected)')
          : fail('§P0-1(1) A affected ' + n + ' row(s) rewriting email');
});

// (1b) A tries to change its email to any other value → row must be UNCHANGED.
await asUser(A_UID, async () => {
  const n = await affectedRows(`update customers set email='attacker@evil.com' where auth_user_id=$1`, [A_UID]);
  n === 0 ? pass('§P0-1(1b) authenticated A CANNOT change its email at all via Data API')
          : fail('§P0-1(1b) A affected ' + n + ' row(s) changing email');
});

// (2) A tries to change auth_user_id → row must be UNCHANGED.
await asUser(A_UID, async () => {
  const n = await affectedRows(`update customers set auth_user_id=$1 where auth_user_id=$2`, [B_UID, A_UID]);
  n === 0 ? pass('§P0-1(2) authenticated A CANNOT change auth_user_id (0 rows affected)')
          : fail('§P0-1(2) A affected ' + n + ' row(s) changing auth_user_id');
});

// (2c) TRIGGER BACKSTOP: if a self-update policy is (wrongly) re-added later, the trigger
// must still hard-block identity mutation. Prove it by temporarily re-adding the policy.
// (policies can only be created by the table owner — do this as the owner/superuser, which
//  is exactly how a stray future migration would re-introduce it.)
await db.exec(`create policy tmp_self_update on customers for update
  using (auth_user_id = auth.uid()) with check (auth_user_id = auth.uid())`);
await db.exec(`grant update on customers to authenticated`);
await asUser(A_UID, () =>
  expectThrow(() => q(`update customers set email='bob@example.com' where auth_user_id=$1`, [A_UID]),
    '§P0-1(2c) trigger backstop HARD-BLOCKS email change even if a self-update policy is re-added'));
await db.exec(`drop policy tmp_self_update on customers`);

// (2b) A tries to INSERT a spoofed customers row directly → MUST fail.
await asUser(A_UID, () =>
  expectThrow(() => q(`insert into customers(auth_user_id,email) values ($1,'bob@example.com')`, [A_UID]),
    '§P0-1(2b) authenticated A CANNOT insert a customers row via Data API'));

// email in DB is unchanged after all attacks:
const aEmailAfter = (await q(`select email from customers where id=$1`, [A_ID]))[0].email;
if (aEmailAfter === 'alice@example.com') pass('§P0-1 A\'s stored email unchanged after attacks');
else fail('§P0-1 A\'s email was mutated to "' + aEmailAfter + '"');

// (4) A cannot read B's orders (isolation). A sees only its own (zero) orders.
const aSeesOrders = await asUser(A_UID, () => q(`select id from orders`));
if (aSeesOrders.length === 0) pass('§P0-1(4) A cannot read B\'s orders (RLS isolation holds)');
else fail('§P0-1(4) A saw ' + aSeesOrders.length + ' order(s) it should not');

// B still sees its own order:
const bSeesOrders = await asUser(B_UID, () => q(`select id from orders`));
if (bSeesOrders.length === 1) pass('§P0-1 B still sees its own order (no over-restriction)');
else fail('§P0-1 B saw ' + bSeesOrders.length + ' orders (expected 1)');

// (3b) legitimate service_role identity UPDATE still works (e.g., re-sync).
await db.exec(`set role service_role`);
await expectOk(() => q(`update customers set company='ACME' where id=$1`, [A_ID]),
  '§P0-1(3b) service_role can still update non-identity fields');
await db.exec(`reset role`);

// (5) normalized legitimate linking: a GUEST row (no auth link) is claimed by verified email.
await db.exec(`set role service_role`);
const GUEST_EMAIL = 'carol@example.com';
const C_UID = '33333333-3333-3333-3333-333333333333';
await q(`insert into customers(email) values ($1)`, [GUEST_EMAIL]);                 // guest, auth_user_id null
await q(`insert into orders(customer_id, total_cents)
         values ((select id from customers where email=$1 and auth_user_id is null), 4200)`, [GUEST_EMAIL]);
// ensureCustomerRow-equivalent: verified user claims the guest row by exact normalized email.
await q(`update customers set auth_user_id=$1 where email=$2 and auth_user_id is null`, [C_UID, GUEST_EMAIL]);
await db.exec(`reset role`);
const cLinked = await asUser(C_UID, () => q(`select o.id from orders o`));
if (cLinked.length === 1) pass('§P0-1(5) verified guest-row claim by normalized email links the historical order');
else fail('§P0-1(5) linked order count = ' + cLinked.length + ' (expected 1)');

// =====================================================================
// §P0-1b VERIFIED-IDENTITY GATE for email-based guest-commerce linking.
// These model the EXACT predicates used by the two webhook linking paths after the fix:
//   main:   customers where email=$ and email_verified_at is not null
//   sample: customers where email=$ and auth_user_id is not null and email_verified_at is not null
// =====================================================================
const VICTIM_EMAIL = 'victim@example.com';
const ATTACKER_UID = '44444444-4444-4444-4444-444444444444';
const VICTIM_UID   = '55555555-5555-5555-5555-555555555555';

// --- ensureCustomerRow-equivalent for an UNVERIFIED attacker signing up as the victim's
//     address: creates an auth-linked row but WITHOUT email_verified_at (fail-safe). ---
await db.exec(`set role service_role`);
await q(`insert into customers(auth_user_id, email, email_verified_at) values ($1,$2, null)`,
  [ATTACKER_UID, VICTIM_EMAIL]);
// A victim guest MAIN order arrives for that email.
await q(`insert into orders(customer_id, total_cents) values (null, 5000)`);   // guest order, unlinked
await db.exec(`reset role`);

// main-order link query (the route's guest fallback):
const mainLink = async () => (await q(
  `select id from customers where email=$1 and email_verified_at is not null limit 1`, [VICTIM_EMAIL]));
let ml = await mainLink();
if (ml.length === 0) pass('§P0-1b(1) UNVERIFIED account CANNOT be the main-order email link target');
else fail('§P0-1b(1) unverified account was linkable for a main order');

// sample-credit link query (the route's sample path):
const sampleLink = async () => (await q(
  `select id from customers where email=$1 and auth_user_id is not null and email_verified_at is not null limit 1`,
  [VICTIM_EMAIL]));
let sl = await sampleLink();
if (sl.length === 0) pass('§P0-1b(2) UNVERIFIED account CANNOT receive the victim\'s sample credit');
else fail('§P0-1b(2) unverified account was linkable for sample credit');

// --- Now the LEGITIMATE victim signs in and their email IS verified: ensureCustomerRow
//     upgrades the marker (server_role write). The SAME normalized email must now link. ---
await db.exec(`set role service_role`);
// The attacker row occupies auth_user_id; the real victim is a DIFFERENT auth user with the
// same address. In production the unique(auth_user_id) holds; email is not unique, so the
// verified victim gets their own verified row (mirrors ensureCustomerRow verified insert).
await q(`insert into customers(auth_user_id, email, email_verified_at) values ($1,$2, now())`,
  [VICTIM_UID, VICTIM_EMAIL]);
await db.exec(`reset role`);

ml = await mainLink();
if (ml.length === 1) pass('§P0-1b(3) VERIFIED account with same normalized email CAN claim its guest commerce');
else fail('§P0-1b(3) verified account link count = ' + ml.length + ' (expected 1)');
sl = await sampleLink();
if (sl.length === 1) pass('§P0-1b(3b) VERIFIED account is the sample-credit link target');
else fail('§P0-1b(3b) verified sample link count = ' + sl.length + ' (expected 1)');

// --- (4) marker is server-controlled: authenticated attacker cannot self-set it to become
//     linkable (immutability trigger + no update policy). ---
await asUser(ATTACKER_UID, async () => {
  const n = await affectedRows(
    `update customers set email_verified_at=now() where auth_user_id=$1`, [ATTACKER_UID]);
  n === 0 ? pass('§P0-1b(4) attacker CANNOT self-set email_verified_at via Data API (0 rows)')
          : fail('§P0-1b(4) attacker changed email_verified_at on ' + n + ' row(s)');
});
// and with a self-update policy re-added, the trigger hard-blocks it:
await db.exec(`create policy tmp_su2 on customers for update
  using (auth_user_id = auth.uid()) with check (auth_user_id = auth.uid())`);
await db.exec(`grant update on customers to authenticated`);
await asUser(ATTACKER_UID, () =>
  expectThrow(() => q(`update customers set email_verified_at=now() where auth_user_id=$1`, [ATTACKER_UID]),
    '§P0-1b(4b) trigger backstop HARD-BLOCKS self-setting email_verified_at'));
await db.exec(`drop policy tmp_su2 on customers`);

// =====================================================================
// §P0-1c VERIFICATION MARKER MUST BE BOUND TO THE VERIFIED AUTH EMAIL VALUE.
// Models the exact ensureCustomerRow existing-row write sequence (run as service_role, the
// same role the server sync uses): when the verified Auth email differs from the stored
// email, sync the stored email to the verified value AND stamp the marker in one write;
// when it matches, stamp once; when Auth is not verified, clear a stale marker.
// =====================================================================
const norm = (s) => s.trim().toLowerCase();
async function ensureRowSync({ authUid, authEmail, authVerified }) {
  const e = norm(authEmail);
  await db.exec(`set role service_role`);
  try {
    const rows = await q(`select id, email, email_verified_at from customers where auth_user_id=$1`, [authUid]);
    if (rows.length === 0) return;                 // (creation paths covered elsewhere)
    const mine = rows[0];
    if (authVerified) {
      if (norm(mine.email) !== e) {
        await q(`update customers set email=$1, email_verified_at=now() where id=$2`, [e, mine.id]);
      } else if (!mine.email_verified_at) {
        await q(`update customers set email_verified_at=now() where id=$1`, [mine.id]);
      }
    } else if (mine.email_verified_at) {
      await q(`update customers set email_verified_at=null where id=$1`, [mine.id]);
    }
  } finally { await db.exec(`reset role`); }
}
const trustedByMain   = async (e) => (await q(`select id from customers where email=$1 and email_verified_at is not null limit 1`, [e])).length > 0;
const trustedBySample = async (e) => (await q(`select id from customers where email=$1 and auth_user_id is not null and email_verified_at is not null limit 1`, [e])).length > 0;

const P_A   = '66666666-6666-6666-6666-666666666666';   // attacker auth user
const P_VIC = 'poison-victim@example.com';
const P_ATK = 'attacker-real@example.com';

// (1) HISTORICAL POISONED ROW: auth_user_id=A, email=victim, marker null; Auth A verified = attacker email.
await db.exec(`set role service_role`);
await q(`insert into customers(auth_user_id, email, email_verified_at) values ($1,$2,null)`, [P_A, P_VIC]);
await db.exec(`reset role`);
await ensureRowSync({ authUid: P_A, authEmail: P_ATK, authVerified: true });
if (!(await trustedByMain(P_VIC)) && !(await trustedBySample(P_VIC)))
  pass('§P0-1c(1) poisoned victim email is NOT trusted/linkable after verified sync');
else fail('§P0-1c(1) poisoned victim email still trusted after sync');
if ((await trustedByMain(P_ATK)) && (await trustedBySample(P_ATK)))
  pass('§P0-1c(1) attacker\'s real verified email becomes the authoritative trusted identity');
else fail('§P0-1c(1) attacker verified email not trusted after sync');

// (2) UNVERIFIED signup as victim email → later Auth email changed to attacker & verified.
const U_A = '77777777-7777-7777-7777-777777777777';
const U_VIC = 'unv-victim@example.com', U_ATK = 'unv-attacker@example.com';
await db.exec(`set role service_role`);
await q(`insert into customers(auth_user_id, email, email_verified_at) values ($1,$2,null)`, [U_A, U_VIC]);
await db.exec(`reset role`);
await ensureRowSync({ authUid: U_A, authEmail: U_ATK, authVerified: true });
if (!(await trustedByMain(U_VIC)) && !(await trustedBySample(U_VIC)))
  pass('§P0-1c(2) unverified-then-changed victim email never receives the marker');
else fail('§P0-1c(2) victim email wrongly trusted after Auth email change');

// (3) STALE VERIFIED email → verified Auth email changes → old stops, new authoritative.
const S_A = '88888888-8888-8888-8888-888888888888';
const S_OLD = 'stale-old@example.com', S_NEW = 'stale-new@example.com';
await db.exec(`set role service_role`);
await q(`insert into customers(auth_user_id, email, email_verified_at) values ($1,$2, now())`, [S_A, S_OLD]);
await db.exec(`reset role`);
if (await trustedByMain(S_OLD)) pass('§P0-1c(3) precondition: old verified email initially trusted');
else fail('§P0-1c(3) precondition failed: old email not trusted');
await ensureRowSync({ authUid: S_A, authEmail: S_NEW, authVerified: true });
if (!(await trustedByMain(S_OLD)) && !(await trustedBySample(S_OLD)))
  pass('§P0-1c(3) old verified email STOPS being linkable after verified Auth-email change');
else fail('§P0-1c(3) old email still linkable after change');
if ((await trustedByMain(S_NEW)) && (await trustedBySample(S_NEW)))
  pass('§P0-1c(3) new verified email becomes authoritative');
else fail('§P0-1c(3) new email not authoritative');

// (4) LEGITIMATE same-email verified row remains linkable (no accidental over-restriction).
const L_A = '99999999-9999-9999-9999-999999999999';
const L_E = 'legit@example.com';
await db.exec(`set role service_role`);
await q(`insert into customers(auth_user_id, email, email_verified_at) values ($1,$2, now())`, [L_A, L_E]);
await db.exec(`reset role`);
await ensureRowSync({ authUid: L_A, authEmail: L_E, authVerified: true });
if ((await trustedByMain(L_E)) && (await trustedBySample(L_E)))
  pass('§P0-1c(4) legitimate verified same-email row stays linkable');
else fail('§P0-1c(4) legitimate verified row lost linkability');

// (6) explicit: after sync, BOTH webhook predicates cannot select the stale/old emails.
if (!(await trustedByMain(P_VIC)) && !(await trustedBySample(P_VIC)) &&
    !(await trustedByMain(S_OLD)) && !(await trustedBySample(S_OLD)))
  pass('§P0-1c(6) main + sample predicates cannot select any stale/old email post-sync');
else fail('§P0-1c(6) a stale email is still selectable by a webhook predicate');

// =====================================================================
// §P0-1d TIE-IN: a phone-confirmed / email-UNconfirmed Auth user (emailVerified=false via
// deriveEmailVerified) must produce NO marker and be unlinkable end-to-end. ensureRowSync
// with authVerified=false must never stamp; the webhook predicates must reject the email.
// =====================================================================
const PH_A = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
const PH_E = 'phone-only@example.com';
await db.exec(`set role service_role`);
await q(`insert into customers(auth_user_id, email, email_verified_at) values ($1,$2,null)`, [PH_A, PH_E]);
await db.exec(`reset role`);
// emailVerified is false for this user (email_confirmed_at null) → authVerified:false.
await ensureRowSync({ authUid: PH_A, authEmail: PH_E, authVerified: false });
if (!(await trustedByMain(PH_E)) && !(await trustedBySample(PH_E)))
  pass('§P0-1d phone-confirmed/email-unconfirmed identity is NOT a webhook linking target');
else fail('§P0-1d phone-only-confirmed identity became linkable');

console.log(failures === 0 ? '\nALL P0-1 RLS CHECKS PASSED' : `\n${failures} P0-1 RLS CHECK(S) FAILED`);
process.exit(failures ? 1 : 0);
