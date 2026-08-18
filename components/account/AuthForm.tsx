'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { Locale } from '@/i18n/config';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import { ACCOUNT_COPY } from '@/lib/customer/copy';
import { Button } from '@/components/ui';

type Mode = 'login' | 'register' | 'forgot' | 'reset';

export default function AuthForm({ locale, mode }: { locale: Locale; mode: Mode }) {
  const t = ACCOUNT_COPY[locale];
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [company, setCompany] = useState('');
  const [state, setState] = useState<'idle'|'busy'|'verify'|'sent'|'ok'|'err'>('idle');
  const [err, setErr] = useState('');

  async function onSubmit() {
    const sb = createSupabaseBrowserClient();
    if (!sb) { setState('err'); setErr('Auth not configured.'); return; }
    setState('busy'); setErr('');
    try {
      if (mode === 'login') {
        const { error } = await sb.auth.signInWithPassword({ email, password });
        if (error) throw error;
        router.push(`/${locale}/konto`); router.refresh(); return;
      }
      if (mode === 'register') {
        const { error } = await sb.auth.signUp({ email, password,
          options: { emailRedirectTo: `${location.origin}/${locale}/konto/anmelden`, data: { company } } });
        if (error) throw error;
        setState('verify'); return;
      }
      if (mode === 'forgot') {
        await sb.auth.resetPasswordForEmail(email, { redirectTo: `${location.origin}/${locale}/konto/reset` });
        setState('sent'); return;   // neutral response — don't reveal whether the email exists
      }
      if (mode === 'reset') {
        const { error } = await sb.auth.updateUser({ password });
        if (error) throw error;
        setState('ok'); setTimeout(() => router.push(`/${locale}/konto/anmelden`), 1500); return;
      }
    } catch (e: any) { setState('err'); setErr(e?.message ?? 'Error'); }
  }

  if (state === 'verify') return <Note title={t.verifyTitle} body={t.verifyBody} />;
  if (state === 'sent') return <Note title={t.reset} body={t.checkInbox} />;
  if (state === 'ok') return <Note title={t.reset} body="✓" />;

  const title = mode==='login'?t.login : mode==='register'?t.register : mode==='forgot'?t.forgot : t.newPassword;
  return (
    <div className="authbox">
      <h1>{title}</h1>
      {mode !== 'reset' && <div className="field"><label htmlFor="au-em">{t.email}</label>
        <input id="au-em" type="email" className="input" value={email} onChange={e=>setEmail(e.target.value)} autoComplete="email" /></div>}
      {mode === 'register' && <div className="field"><label htmlFor="au-co">{t.company}</label>
        <input id="au-co" className="input" value={company} onChange={e=>setCompany(e.target.value)} autoComplete="organization" /></div>}
      {(mode==='login'||mode==='register'||mode==='reset') && <div className="field"><label htmlFor="au-pw">{mode==='reset'?t.newPassword:t.password}</label>
        <input id="au-pw" type="password" className="input" value={password} onChange={e=>setPassword(e.target.value)} autoComplete={mode==='login'?'current-password':'new-password'} /></div>}
      {state==='err' && <p className="authbox__err" role="alert">{err}</p>}
      <Button onClick={state==='busy'?undefined:onSubmit} variant="primary" size="lg">{state==='busy'?'…':(mode==='forgot'?t.send:title)}</Button>
      <div className="authbox__links">
        {mode==='login' && <><Link href={`/${locale}/konto/passwort`}>{t.forgot}</Link><span>{t.noAccount} <Link href={`/${locale}/konto/registrieren`}>{t.register}</Link></span></>}
        {mode==='register' && <span>{t.haveAccount} <Link href={`/${locale}/konto/anmelden`}>{t.login}</Link></span>}
        {(mode==='forgot'||mode==='reset') && <Link href={`/${locale}/konto/anmelden`}>{t.login}</Link>}
      </div>
      <p className="muted" style={{ fontSize:'.8rem', marginTop:'var(--s-3)' }}>{t.guestNote}</p>
    </div>
  );
}

function Note({ title, body }: { title: string; body: string }) {
  return <div className="authbox"><h1>{title}</h1><p className="muted">{body}</p></div>;
}
