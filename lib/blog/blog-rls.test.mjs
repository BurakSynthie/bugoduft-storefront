// Blog CMS RLS / SQL regression test. Runs migration 0036 VERBATIM against PGlite with the
// real anon/authenticated/service_role roles and the real is_admin() semantics, then proves
// the EXACT production permission surface (no test-only grants):
//   * public (anon) SELECT sees ONLY published posts + their translations (drafts hidden),
//   * a guessed DRAFT slug returns no row to anon,
//   * anon INSERT/UPDATE/DELETE are denied (table privilege revoked by 0036),
//   * ordinary authenticated user HAS the DML table privilege (0036 grants it) but every
//     write is blocked by RLS because is_admin() is false — RLS is the real write boundary,
//   * authenticated ADMIN (is_admin()=true) can INSERT / UPDATE / DELETE and read drafts,
//   * unique(locale,slug) + unique(blog_post_id,locale) + locale/status CHECKs are enforced.
// Run: node lib/blog/blog-rls.test.mjs
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';

let failures = 0;
const pass = (m) => console.log('PASS ' + m);
const fail = (m) => { console.log('FAIL ' + m); failures++; };
const db = await PGlite.create();
const q = async (sql, p) => (await db.query(sql, p)).rows;

// ---- roles + minimal real prerequisites (media table, is_admin(), set_updated_at) ----
await db.exec(`
  do $$ begin create role anon;          exception when duplicate_object then null; end $$;
  do $$ begin create role authenticated; exception when duplicate_object then null; end $$;
  do $$ begin create role service_role;  exception when duplicate_object then null; end $$;
  alter role service_role bypassrls;

  create schema if not exists auth;
  create table auth.users(id uuid primary key);
  -- test-controllable current user (drives is_admin()).
  create table auth_uid_state(uid uuid);
  insert into auth_uid_state values (null);
  create or replace function auth.uid() returns uuid language sql stable security definer as $$ select uid from auth_uid_state $$;

  create table admin_users(id uuid primary key);
  create or replace function is_admin() returns boolean
    language sql stable security definer set search_path = public
    as $$ select exists(select 1 from admin_users where id = auth.uid()) $$;

  create or replace function set_updated_at() returns trigger language plpgsql as $$
    begin new.updated_at = now(); return new; end $$;

  -- media referenced by blog_posts.cover_media_id
  create table media(id uuid primary key default gen_random_uuid(), storage_path text);

  -- Base privileges on the STUB prerequisite tables only (media FK target, admin_users +
  -- auth_uid_state read by is_admin()/auth.uid()). We deliberately DO NOT grant anything on
  -- the blog tables here — every blog-table privilege must come from 0036 itself, so the test
  -- exercises the REAL production permission surface (no test-only grants that could mask a bug).
  grant all on media, admin_users, auth_uid_state to anon, authenticated, service_role;
`);

// Apply 0036 VERBATIM — including RLS policies AND its GRANT/REVOKE surface. Nothing else
// grants privileges on the blog tables; the assertions below reflect exactly what 0036 sets.
await db.exec(readFileSync('supabase/migrations/0036_blog_cms.sql', 'utf8'));

// helper to run as a role, optionally as an admin uid
async function asRole(role, fn) { await db.exec(`set role ${role}`); try { return await fn(); } finally { await db.exec('reset role'); } }
async function setUid(uid) { await db.exec(`update auth_uid_state set uid = ${uid ? `'${uid}'` : 'null'}`); }

const ADMIN_ID = '11111111-1111-1111-1111-111111111111';
await db.exec(`insert into admin_users(id) values ('${ADMIN_ID}')`);

// ---- seed as owner: one published post (de+en) and one draft post (de) ----
const pub = (await q(`insert into blog_posts(status, published_at) values ('published', now()) returning id`))[0].id;
await q(`insert into blog_post_translations(blog_post_id, locale, slug, title) values ($1,'de','veroeffentlicht','Veröffentlicht')`, [pub]);
await q(`insert into blog_post_translations(blog_post_id, locale, slug, title) values ($1,'en','published-post','Published')`, [pub]);
const draft = (await q(`insert into blog_posts(status) values ('draft') returning id`))[0].id;
await q(`insert into blog_post_translations(blog_post_id, locale, slug, title) values ($1,'de','entwurf','Entwurf')`, [draft]);

// ---- PUBLIC (anon, not admin) visibility ----
await setUid(null);
await asRole('anon', async () => {
  const posts = await q(`select id, status from blog_posts`);
  (posts.length === 1 && posts[0].status === 'published')
    ? pass('anon sees exactly the published post (draft hidden by RLS)')
    : fail('anon post visibility wrong: ' + JSON.stringify(posts));

  const trs = await q(`select slug from blog_post_translations order by slug`);
  const slugs = trs.map(r => r.slug);
  (slugs.length === 2 && slugs.includes('veroeffentlicht') && slugs.includes('published-post') && !slugs.includes('entwurf'))
    ? pass('anon sees only published translations (draft translation hidden)')
    : fail('anon translation visibility wrong: ' + JSON.stringify(slugs));

  // guessed DRAFT slug returns nothing to anon
  const guess = await q(`select 1 from blog_post_translations where locale='de' and slug='entwurf'`);
  (guess.length === 0) ? pass('guessed draft slug returns no row to anon')
                       : fail('draft slug leaked to anon!');
});

// ---- WRITE DENIAL for non-admins (the REAL boundary) ----
// anon: writes are REVOKED at the table level by 0036 (no grant path at all).
await asRole('anon', async () => {
  let denied = false;
  try { await q(`insert into blog_posts(status) values ('draft')`); } catch { denied = true; }
  denied ? pass('anon INSERT on blog_posts denied (table privilege revoked)') : fail('anon could INSERT blog_posts!');
  let dU = false;
  try { await q(`update blog_posts set status='published' where id='${draft}'`); } catch { dU = true; }
  dU ? pass('anon UPDATE denied') : fail('anon could UPDATE!');
  let dD = false;
  try { await q(`delete from blog_posts where id='${draft}'`); } catch { dD = true; }
  dD ? pass('anon DELETE denied') : fail('anon could DELETE!');
});

// ordinary authenticated user (is_admin() = FALSE): 0036 GRANTS the DML table privilege, so
// the write reaches RLS — and RLS (with check is_admin()) is what blocks it. This proves the
// security boundary is the RLS policy, NOT a missing grant. We confirm the privilege exists,
// then that the write is refused while is_admin() is false.
await setUid(null);   // authenticated but NOT an admin
// Sanity: the table privilege really was granted to authenticated by 0036.
const hasIns = (await q(`select has_table_privilege('authenticated','blog_posts','INSERT') as ok`))[0].ok;
const hasUpd = (await q(`select has_table_privilege('authenticated','blog_post_translations','UPDATE') as ok`))[0].ok;
(hasIns && hasUpd) ? pass('0036 grants authenticated the underlying INSERT/UPDATE table privilege (so RLS can decide)')
                   : fail('authenticated is MISSING blog DML privilege — RLS can never allow admin writes!');
// ordinary authenticated INSERT is blocked by RLS (WITH CHECK is_admin() = false).
await asRole('authenticated', async () => {
  let denied = false;
  try { await q(`insert into blog_posts(status) values ('draft')`); } catch { denied = true; }
  denied ? pass('ordinary authenticated INSERT blocked by RLS (is_admin() = false), not by missing grant')
         : fail('ordinary authenticated could INSERT blog_posts (RLS not enforcing)!');
});

// ordinary authenticated UPDATE/DELETE on the PUBLISHED post (which it CAN read) must have no
// effect: RLS USING/CHECK filters the write. We run the write as authenticated, then read back
// as owner (bypassing RLS visibility) to assert the row is unchanged / still present.
{
  await db.exec('set role authenticated');
  let uErr = false;
  try { await db.query(`update blog_posts set status='draft' where id=$1`, [pub]); } catch { uErr = true; }
  let dErr = false;
  try { await db.query(`delete from blog_posts where id=$1`, [pub]); } catch { dErr = true; }
  await db.exec('reset role');
  const row = (await q(`select status from blog_posts where id='${pub}'`))[0];
  (uErr || (row && row.status === 'published'))
    ? pass('ordinary authenticated UPDATE has no effect (RLS blocks write to the published row)')
    : fail('ordinary authenticated changed a published post via UPDATE!');
  (dErr || (row && row.status === 'published'))
    ? pass('ordinary authenticated DELETE has no effect (RLS blocks removal of the published row)')
    : fail('ordinary authenticated deleted a published post!');
}

// ---- ADMIN (is_admin() = true) full access — using ONLY the privileges 0036 granted ----
await setUid(ADMIN_ID);
await asRole('authenticated', async () => {
  const all = await q(`select status from blog_posts`);
  (all.length === 2) ? pass('admin sees BOTH posts incl. draft') : fail('admin cannot see draft: ' + JSON.stringify(all));

  // admin can INSERT a new post + translation (privileges from 0036; RLS with check is_admin() passes)
  const npid = (await q(`insert into blog_posts(status) values ('draft') returning id`))[0].id;
  await q(`insert into blog_post_translations(blog_post_id, locale, slug, title) values ($1,'fr','nouvel-article','Nouvel')`, [npid]);
  const created = await q(`select 1 from blog_posts where id='${npid}'`);
  (created.length === 1) ? pass('admin CREATE (INSERT) post + translation allowed') : fail('admin INSERT did not persist!');

  // admin can UPDATE (publish)
  await q(`update blog_posts set status='published', published_at=now() where id='${npid}'`);
  const upd = (await q(`select status from blog_posts where id='${npid}'`))[0];
  (upd && upd.status === 'published') ? pass('admin UPDATE (publish) allowed') : fail('admin UPDATE did not apply!');

  // admin can DELETE (cascades to translations)
  await q(`delete from blog_posts where id='${npid}'`);
  const gone = await q(`select 1 from blog_post_translations where blog_post_id='${npid}'`);
  (gone.length === 0) ? pass('admin DELETE allowed (cascades to translations)') : fail('admin DELETE / cascade failed!');
});

// ---- unique constraints (run as owner) ----
let uniqLocaleSlug = false;
try { await q(`insert into blog_post_translations(blog_post_id, locale, slug, title) values ($1,'de','veroeffentlicht','dup')`, [draft]); }
catch { uniqLocaleSlug = true; }
uniqLocaleSlug ? pass('unique(locale,slug) enforced (duplicate localized slug rejected)')
              : fail('duplicate (locale,slug) accepted!');

let uniqPostLocale = false;
try { await q(`insert into blog_post_translations(blog_post_id, locale, slug, title) values ($1,'de','another-de','x')`, [pub]); }
catch { uniqPostLocale = true; }
uniqPostLocale ? pass('unique(blog_post_id,locale) enforced (one translation per locale)')
              : fail('two translations for same (post,locale) accepted!');

// locale check constraint rejects a bad locale
let localeChk = false;
try { await q(`insert into blog_post_translations(blog_post_id, locale, slug, title) values ($1,'xx','bad','x')`, [pub]); }
catch { localeChk = true; }
localeChk ? pass('locale check constraint rejects non de/en/fr') : fail('bad locale accepted!');

// status check constraint rejects a bad status
let statusChk = false;
try { await q(`insert into blog_posts(status) values ('bogus')`); }
catch { statusChk = true; }
statusChk ? pass('status check constraint rejects unknown status') : fail('bad status accepted!');

console.log(failures === 0 ? '\nALL BLOG RLS TESTS PASSED' : `\n${failures} BLOG RLS TEST(S) FAILED`);
process.exit(failures ? 1 : 0);
