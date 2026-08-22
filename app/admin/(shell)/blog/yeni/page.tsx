import { requireAdmin } from '@/lib/supabase/admin-auth';
import { newBlogPost } from '@/lib/blog/empty';
import BlogEditor from '../BlogEditor';

export const metadata = { title: 'Yeni yazı · BUGO DUFT' };
export const dynamic = 'force-dynamic';

export default async function NewBlogPost() {
  await requireAdmin();
  return <BlogEditor initial={newBlogPost()} />;
}
