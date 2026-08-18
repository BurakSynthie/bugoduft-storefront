'use client';
import { useState } from 'react';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
export default function LoginForm() {
  const [email,setEmail]=useState(''); const [pw,setPw]=useState('');
  const [busy,setBusy]=useState(false); const [err,setErr]=useState<string|null>(null);
  async function submit() {
    setErr(null); setBusy(true);
    const sb = createSupabaseBrowserClient();
    if (!sb) { setErr('Supabase yapılandırılmadı.'); setBusy(false); return; }
    const { error } = await sb.auth.signInWithPassword({ email, password: pw });
    if (error) { setErr('Giriş başarısız. E-posta veya şifre hatalı.'); setBusy(false); return; }
    window.location.assign('/admin');   // full nav => new auth cookie reaches middleware/server
  }
  return (
    <div className="adm-panel" style={{maxWidth:380,margin:'10vh auto'}}>
      <h1 style={{fontSize:'1.3rem',marginBottom:'var(--s-4)'}}>BUGO DUFT · Yönetim</h1>
      <div className="field"><label htmlFor="e">E-posta</label>
        <input id="e" className="input" type="email" value={email} onChange={e=>setEmail(e.target.value)} /></div>
      <div className="field"><label htmlFor="p">Şifre</label>
        <input id="p" className="input" type="password" value={pw} onChange={e=>setPw(e.target.value)}
          onKeyDown={e=>{ if(e.key==='Enter') submit(); }} /></div>
      {err && <p className="cfg-error" role="alert">{err}</p>}
      <button className="adm-btn adm-btn--primary" disabled={busy} aria-busy={busy} onClick={submit}
        style={{width:'100%',marginTop:'var(--s-3)'}}>{busy?'Giriş yapılıyor…':'Giriş yap'}</button>
    </div>
  );
}
