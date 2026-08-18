'use client';
import { useState } from 'react';
import { centsToInput, inputToCents } from '@/lib/money';
// Reusable EUR money field. Shows "269,00 €", stores integer cents via onCents.
export default function MoneyInput({ cents, onCents, id }:
  { cents: number; onCents?: (c: number | null) => void; id?: string }) {
  const [text, setText] = useState(centsToInput(cents, 'de'));
  const [err, setErr] = useState(false);
  function commit(v: string) {
    const c = inputToCents(v);
    setErr(v.trim() !== '' && c === null);
    onCents?.(c);
    if (c !== null) setText(centsToInput(c, 'de'));   // re-normalize on blur
  }
  return (
    <div>
      <div style={{ position:'relative' }}>
        <input id={id} className="input" inputMode="decimal" value={text}
          style={{ paddingRight:'2rem', borderColor: err ? 'var(--danger)' : undefined }}
          onChange={e => { setText(e.target.value); setErr(false); }}
          onBlur={e => commit(e.target.value)} />
        <span style={{ position:'absolute', right:'.7rem', top:'50%', transform:'translateY(-50%)', color:'var(--fg-muted)' }}>€</span>
      </div>
      {err && <small style={{ color:'var(--danger)' }}>Geçersiz tutar. Örn. 269,00</small>}
    </div>
  );
}
