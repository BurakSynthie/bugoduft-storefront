import { notFound } from 'next/navigation';
import { requireAdmin } from '@/lib/supabase/admin-auth';
import { loadBlogPost } from '@/repositories/admin-blog';
import BlogEditor from '../BlogEditor';

export const metadata = { title: 'Yazıyı düzenle · BUGO DUFT' };
export const dynamic = 'force-dynamic';

type Params = { id: string };

export default async function EditBlogPost({ params }: { params: Promise<Params> }) {
  await requireAdmin();
  const { id } = await params;
  const post = await loadBlogPost(id);
  if (!post) notFound();
  return <BlogEditor initial={post} />;
}
