import { isLocale, type Locale } from '@/i18n/config';
import { notFound } from 'next/navigation';
import AuthForm from '@/components/account/AuthForm';
export const dynamic = 'force-dynamic';
export default function Page({ params }: { params:{ locale:string } }) {
  if (!isLocale(params.locale)) notFound();
  return <section className="section"><div className="container authwrap"><AuthForm locale={params.locale as Locale} mode="reset" /></div></section>;
}
