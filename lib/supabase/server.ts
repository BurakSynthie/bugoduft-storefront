import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { createClient } from '@supabase/supabase-js';
import { supabaseEnv, isSupabaseConfigured, assertServer } from './env';

// RLS-scoped server client (anon key + user session cookies). null when unconfigured.
// §HIGH-16 Next.js 15: cookies() is now ASYNC. The @supabase/ssr cookie adapter awaits getAll/
// setAll, so we resolve the cookie store lazily inside them — keeping this factory synchronous so
// its many callers stay unchanged.
export function createSupabaseServerClient() {
  if (!isSupabaseConfigured()) return null;
  return createServerClient(supabaseEnv.url, supabaseEnv.anonKey, {
    cookies: {
      async getAll() { return (await cookies()).getAll(); },
      async setAll(list) {
        try { const store = await cookies(); list.forEach(({ name, value, options }) => store.set(name, value, options)); }
        catch { /* called from a Server Component render — cookies are read-only there */ }
      },
    },
  });
}

// Service-role client — SERVER ONLY, bypasses RLS. Never import into client code.
// Used only by trusted server tasks (e.g. seed import) once auth/admin exists.
export function createSupabaseServiceClient() {
  assertServer();
  if (!supabaseEnv.url || !supabaseEnv.serviceRoleKey) return null;
  return createClient(supabaseEnv.url, supabaseEnv.serviceRoleKey, { auth: { persistSession: false } });
}
