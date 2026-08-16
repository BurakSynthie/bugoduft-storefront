// Centralized, explicit Supabase env handling. Honest about being unconfigured.
export const supabaseEnv = {
  url: process.env.NEXT_PUBLIC_SUPABASE_URL ?? '',
  anonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '',
  serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY ?? '',   // SERVER ONLY
};
export function isSupabaseConfigured(): boolean {
  return Boolean(supabaseEnv.url && supabaseEnv.anonKey);
}
export function assertServer() {
  if (typeof window !== 'undefined') throw new Error('Server-only Supabase client used in the browser.');
}
