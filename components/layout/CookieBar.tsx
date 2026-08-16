'use client';
import { useEffect, useState } from 'react';
import type { Dict } from '@/i18n';
import { Button } from '@/components/ui';
// Consent UI shell. Records choice locally. Does NOT load analytics/ads (none configured).
// Google Consent Mode wiring is added in Phase 9 once a real CMP/analytics is configured.
export default function CookieBar({ dict }: { dict: Dict }) {
  const [show, setShow] = useState(false);
  useEffect(() => { try { if (!localStorage.getItem('bugo_consent')) setShow(true); } catch {} }, []);
  function decide(v: 'all' | 'necessary') {
    try { localStorage.setItem('bugo_consent', v); } catch {}
    setShow(false);
    // TODO(P9): push consent state to Consent Mode / CMP when configured.
  }
  if (!show) return null;
  const c = dict.cookie;
  return (
    <div className="cookie" role="dialog" aria-label={c.title} aria-live="polite">
      <strong>{c.title}</strong>
      <p style={{ marginTop:'.5rem' }}>{c.body}</p>
      <div className="cookie__row">
        <Button onClick={() => decide('all')} variant="primary">{c.all}</Button>
        <Button onClick={() => decide('necessary')} variant="ghost">{c.necessary}</Button>
      </div>
    </div>
  );
}
