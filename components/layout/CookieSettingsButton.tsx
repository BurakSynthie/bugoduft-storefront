'use client';
// Footer "Cookie settings" control — reopens the existing CookieBar consent UI via event.
// Never navigates (no homepage fallback).
export default function CookieSettingsButton({ label }: { label: string }) {
  return (
    <button
      type="button"
      className="footer__linkbtn"
      onClick={() => { try { window.dispatchEvent(new CustomEvent('bugo:open-consent')); } catch {} }}
    >
      {label}
    </button>
  );
}
