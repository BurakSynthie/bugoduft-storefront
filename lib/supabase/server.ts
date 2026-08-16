import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { createClient } from '@supabase/supabase-js';
import { supabaseEnv, isSupabaseConfigured, assertServer } from './env';

// RLS-scoped server client (anon key + user session cookies). null when unconfigured.
export function createSupabaseServerClient() {
  if (!isSupabaseConfigured()) return null;
  const cookieStore = cookies();
  return createServerClient(supabaseEnv.url, supabaseEnv.anonKey, {
    cookies: {
      getAll() { return cookieStore.getAll(); },
      setAll(list) { try { list.forEach(({ name, value, options }) => cookieStore.set(name, value, options)); } catch {} },
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
