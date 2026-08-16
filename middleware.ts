import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { locales, defaultLocale } from '@/i18n/config';

const PUBLIC_FILE = /\.[^/]+$/;
// Include /admin so it can be auth-guarded (still exclude _next, api, static files).
export const config = { matcher: ['/((?!_next|api|.*\\..*).*)'] };

async function guardAdmin(req: NextRequest): Promise<NextResponse | undefined> {
  const { pathname } = req.nextUrl;
  if (pathname === '/admin/giris') return;                      // login page is public
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL, anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) return;                                    // unconfigured: let pages show honest state
  const res = NextResponse.next();
  const sb = createServerClient(url, anon, {
    cookies: { getAll: () => req.cookies.getAll(),
      setAll: (list) => list.forEach(({ name, value, options }) => res.cookies.set(name, value, options)) },
  });
  const { data: { user } } = await sb.auth.getUser();
  if (!user) { const to = req.nextUrl.clone(); to.pathname = '/admin/giris'; return NextResponse.redirect(to); }
  return res;                                                   // membership (admin_users) enforced server-side + RLS
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (PUBLIC_FILE.test(pathname)) return;
  if (pathname === '/admin' || pathname.startsWith('/admin/')) return guardAdmin(req);
  const hasLocale = locales.some(l => pathname === `/${l}` || pathname.startsWith(`/${l}/`));
  if (hasLocale) return;
  const url = req.nextUrl.clone();
  url.pathname = `/${defaultLocale}${pathname === '/' ? '' : pathname}`;
  return NextResponse.redirect(url);
}
