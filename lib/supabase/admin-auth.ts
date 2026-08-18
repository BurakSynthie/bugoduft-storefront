import 'server-only';
import { redirect } from 'next/navigation';
import { createSupabaseServerClient } from './server';
import { isSupabaseConfigured } from './env';

export type AdminUser = { id: string; email: string; role: string };

// Returns the signed-in admin, or null. Membership is verified against admin_users (RLS).
export async function getAdminUser(): Promise<AdminUser | null> {
  const sb = createSupabaseServerClient();
  if (!sb) return null;
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return null;
  const { data } = await sb.from('admin_users').select('id,email,role').eq('id', user.id).maybeSingle();
  return data ? { id: data.id, email: data.email, role: data.role } : null;
}
// Server guard for admin pages/actions.
export async function requireAdmin(): Promise<AdminUser> {
  const admin = await getAdminUser();
  if (!admin) redirect('/admin/giris');
  return admin;
}
export { isSupabaseConfigured };
