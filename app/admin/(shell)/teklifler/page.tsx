import { requireAdmin } from '@/lib/supabase/admin-auth';
import { listQuotes } from '@/repositories/admin-quotes';
import QuotesAdmin from './QuotesAdmin';
export const metadata = { title: 'Teklifler · BUGO DUFT' };
export const dynamic = 'force-dynamic';
export default async function AdminQuotes() {
  await requireAdmin();
  const quotes = await listQuotes();
  return (
    <>
      <div className="adm__top"><div><h1>Teklifler</h1><div className="adm__crumb">Operasyon / Teklifler</div></div></div>
      <QuotesAdmin initial={quotes} />
    </>
  );
}
