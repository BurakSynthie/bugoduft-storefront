// §4 Consent categories. necessary is always on; analytics + marketing are opt-in.
// Back-compatible with the old 'bugo_consent' ('all' | 'necessary') value.
export type Consent = { analytics: boolean; marketing: boolean };

export function readConsent(): Consent | null {
  try {
    const v2 = localStorage.getItem('bugo_consent_v2');
    if (v2) { const p = JSON.parse(v2); return { analytics: !!p.analytics, marketing: !!p.marketing }; }
    const v1 = localStorage.getItem('bugo_consent');
    if (v1 === 'all') return { analytics: true, marketing: true };
    if (v1 === 'necessary') return { analytics: false, marketing: false };
  } catch {}
  return null;
}

export function writeConsent(c: Consent) {
  try {
    localStorage.setItem('bugo_consent_v2', JSON.stringify(c));
    // keep legacy key roughly in sync for any old readers
    localStorage.setItem('bugo_consent', c.analytics && c.marketing ? 'all' : 'necessary');
  } catch {}
}
