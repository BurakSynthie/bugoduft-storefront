'use client';
import { createBrowserClient } from '@supabase/ssr';
import { supabaseEnv, isSupabaseConfigured } from './env';
// Browser client (anon key only). Returns null when unconfigured — callers stay honest.
export function createSupabaseBrowserClient() {
  if (!isSupabaseConfigured()) return null;
  return createBrowserClient(supabaseEnv.url, supabaseEnv.anonKey);
}
