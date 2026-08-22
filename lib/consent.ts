// §4 Consent categories. necessary is always on; analytics + marketing are opt-in.
// Back-compatible with the old 'bugo_consent' ('all' | 'necessary') value.
export type Consent = { analytics: boolean; marketing: boolean };

const CONSENT_COOKIE = 'bugo_consent_v2';

function mirrorConsentCookie(c: Consent) {
  if (typeof document === 'undefined') return;
  try {
    const value = encodeURIComponent(JSON.stringify(c));
    const secure = typeof window !== 'undefined' && window.location.protocol === 'https:' ? '; Secure' : '';
    document.cookie = `${CONSENT_COOKIE}=${value}; Path=/; Max-Age=31536000; SameSite=Lax${secure}`;
  } catch {}
}

export function parseConsentCookie(raw: string | null | undefined): Consent | null {
  if (!raw) return null;
  try {
    const p = JSON.parse(decodeURIComponent(raw));
    return { analytics: !!p?.analytics, marketing: !!p?.marketing };
  } catch {
    return null;
  }
}

export function readConsent(): Consent | null {
  try {
    const v2 = localStorage.getItem('bugo_consent_v2');
    if (v2) {
      const p = JSON.parse(v2);
      const c = { analytics: !!p.analytics, marketing: !!p.marketing };
      mirrorConsentCookie(c);
      return c;
    }
    const v1 = localStorage.getItem('bugo_consent');
    if (v1 === 'all') {
      const c = { analytics: true, marketing: true };
      mirrorConsentCookie(c);
      return c;
    }
    if (v1 === 'necessary') {
      const c = { analytics: false, marketing: false };
      mirrorConsentCookie(c);
      return c;
    }
  } catch {}
  return null;
}

export function writeConsent(c: Consent) {
  try {
    localStorage.setItem('bugo_consent_v2', JSON.stringify(c));
    // keep legacy key roughly in sync for any old readers
    localStorage.setItem('bugo_consent', c.analytics && c.marketing ? 'all' : 'necessary');
    mirrorConsentCookie(c);
  } catch {}
}
