'use client';
import { useState } from 'react';
const ENABLED = ['EUR'] as const;            // admin-managed later; EUR primary
export default function CurrencySwitcher() {
  const [cur, setCur] = useState<string>('EUR');
  function pick(c: string) {
    setCur(c);
    document.cookie = `currency=${c}; path=/; max-age=31536000; samesite=lax`;
    // No navigation, no URL param — currency never creates indexable duplicates.
  }
  return (
    <div className="switch" role="group" aria-label="Währung / Currency">
      {ENABLED.map(c => (
        <button key={c} aria-current={c === cur} onClick={() => pick(c)}>{c}</button>
      ))}
    </div>
  );
}
