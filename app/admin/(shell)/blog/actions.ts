'use server';
import {
  saveBlogPost, deleteBlogPost,
  type EditableBlogPost, type BlogSaveResult, type BlogDeleteResult,
} from '@/repositories/admin-blog';

// Thin server-action wrappers over the admin-guarded repository (getAdminUser() re-checked
// inside every repository mutation). Canonical/hreflang/JSON-LD/sitemap stay automatic and
// are never part of these payloads.
export async function saveBlogPostAction(input: EditableBlogPost): Promise<BlogSaveResult> {
  return saveBlogPost(input);
}
export async function deleteBlogPostAction(id: string): Promise<BlogDeleteResult> {
  return deleteBlogPost(id);
}
