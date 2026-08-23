import { NextResponse } from 'next/server';

import { isLocale, type Locale } from '@/i18n/config';
import { itemPath } from '@/lib/routing';
import { getIndustries } from '@/repositories/industries';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const rawLocale = searchParams.get('locale') ?? '';

  if (!isLocale(rawLocale)) {
    return NextResponse.json([], {
      status: 400,
      headers: { 'Cache-Control': 'no-store' },
    });
  }

  const locale = rawLocale as Locale;
  const industries = await getIndustries(locale);

  const entries = industries
    .filter((i) => i.groupId.startsWith('custom:'))
    .map((i) => ({
      kind: 'pages' as const,
      title: i.headline,
      sub: i.body,
      href: itemPath('industries', locale, i.slug),
      blob: `${i.name} ${i.headline} ${i.body}`.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, ''),
    }));

  return NextResponse.json(entries, {
    headers: { 'Cache-Control': 'no-store' },
  });
}
