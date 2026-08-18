import { redirect } from 'next/navigation';
import { getAdminUser } from '@/lib/supabase/admin-auth';
import LoginForm from './LoginForm';
export const dynamic = 'force-dynamic';
export const metadata = { title: 'Giriş · BUGO DUFT', robots: { index:false, follow:false } };
export default async function LoginPage() {
  const admin = await getAdminUser();
  if (admin) redirect('/admin');
  return <LoginForm />;
}
