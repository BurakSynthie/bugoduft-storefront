import { isLocale, type Locale } from '@/i18n/config';
import { notFound } from 'next/navigation';
import AuthForm from '@/components/account/AuthForm';
export const dynamic = 'force-dynamic';
// §HIGH-16 Next.js 15: route params are async (Promise).
export default async function Page({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  return <section className="section"><div className="container authwrap"><AuthForm locale={locale as Locale} mode="reset" /></div></section>;
}
