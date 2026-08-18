'use client';
import { useEffect, useState } from 'react';
import type { Dict } from '@/i18n';
import { Button } from '@/components/ui';
import { readConsent, writeConsent, type Consent } from '@/lib/consent';

// §4 Consent UI with categories (necessary always on; analytics + marketing opt-in).
// Accept all / Reject optional / Manage preferences. Reopened from the footer via the
// 'bugo:open-consent' event. On a downgrade (removing a previously granted category) we do a
// controlled reload so already-loaded trackers stop cleanly; on upgrades we notify the loader.
export default function CookieBar({ dict }: { dict: Dict }) {
  const [show, setShow] = useState(false);
  const [hasChoice, setHasChoice] = useState(true);
  const [manage, setManage] = useState(false);
  const [pref, setPref] = useState<Consent>({ analytics: false, marketing: false });

  useEffect(() => {
    const c = readConsent();
    setHasChoice(!!c);
    if (c) setPref(c); else setShow(true);
    const open = () => { const cur = readConsent(); if (cur) setPref(cur); setManage(true); setShow(true); };
    window.addEventListener('bugo:open-consent', open);
    return () => window.removeEventListener('bugo:open-consent', open);
  }, []);

  function apply(next: Consent) {
    const prev = readConsent();
    writeConsent(next);
    setPref(next); setHasChoice(true); setShow(false); setManage(false);
    const downgraded = !!prev && ((prev.analytics && !next.analytics) || (prev.marketing && !next.marketing));
    if (downgraded) { try { window.location.reload(); } catch {} return; }   // clean stop
    try { window.dispatchEvent(new CustomEvent('bugo:consent-changed', { detail: next })); } catch {}
  }

  if (!show) return null;
  const c = dict.cookie;
  const cc = c as any;
  const t = {
    manage: cc.manage ?? 'Einstellungen', save: cc.save ?? 'Auswahl speichern',
    reject: cc.reject ?? c.necessary, analytics: cc.analytics ?? 'Analyse', marketing: cc.marketing ?? 'Marketing',
  };
  return (
    <div className="cookie" role="dialog" aria-label={c.title} aria-live="polite">
      <strong>{c.title}</strong>
      <p style={{ marginTop:'.5rem' }}>{c.body}</p>
      {manage && (
        <div style={{ margin:'.6rem 0', display:'grid', gap:'.4rem' }}>
          <label style={{ display:'inline-flex', gap:'.5rem', alignItems:'center' }}>
            <input type="checkbox" checked disabled /> {c.necessary}
          </label>
          <label style={{ display:'inline-flex', gap:'.5rem', alignItems:'center' }}>
            <input type="checkbox" checked={pref.analytics} onChange={e=>setPref(p=>({...p, analytics:e.target.checked}))} /> {t.analytics}
          </label>
          <label style={{ display:'inline-flex', gap:'.5rem', alignItems:'center' }}>
            <input type="checkbox" checked={pref.marketing} onChange={e=>setPref(p=>({...p, marketing:e.target.checked}))} /> {t.marketing}
          </label>
        </div>
      )}
      <div className="cookie__row">
        <Button onClick={() => apply({ analytics:true, marketing:true })} variant="primary">{c.all}</Button>
        {manage
          ? <Button onClick={() => apply(pref)} variant="ghost">{t.save}</Button>
          : <Button onClick={() => apply({ analytics:false, marketing:false })} variant="ghost">{t.reject}</Button>}
        {!manage && <button type="button" className="linkbtn" onClick={() => setManage(true)}>{t.manage}</button>}
        {hasChoice && <button type="button" className="linkbtn" onClick={() => setShow(false)} aria-label={c.title} style={{ marginLeft:'auto' }}>✕</button>}
      </div>
    </div>
  );
}
