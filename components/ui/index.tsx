import Link from 'next/link';
import type { ReactNode } from 'react';
import type { Locale } from '@/i18n/config';
import { formatMoney } from '@/lib/money';

export function Container({ children, className='' }: { children: ReactNode; className?: string }) {
  return <div className={`container ${className}`}>{children}</div>;
}
type BtnProps = { children: ReactNode; href?: string; variant?: 'primary'|'ghost'|'dark'|'on-dark';
  size?: 'md'|'lg'; block?: boolean; type?: 'button'|'submit'; onClick?: () => void; ariaLabel?: string };
export function Button({ children, href, variant='primary', size='md', block, type='button', onClick, ariaLabel }: BtnProps) {
  const cls = `btn btn--${variant} ${size==='lg'?'btn--lg':''} ${block?'btn--block':''}`.trim();
  if (href) return <Link className={cls} href={href} aria-label={ariaLabel}>{children}</Link>;
  return <button className={cls} type={type} onClick={onClick} aria-label={ariaLabel}>{children}</button>;
}
export function SectionHeader({ eyebrow, title, lede }: { eyebrow?: string; title: string; lede?: string }) {
  return (
    <header className="stack-6" style={{ marginBottom: 'var(--s-8)' }}>
      <div>
        {eyebrow && <span className="eyebrow">{eyebrow}</span>}
        <h2 className="h2" style={{ marginTop: eyebrow ? 'var(--s-3)' : 0 }}>{title}</h2>
        {lede && <p className="lede">{lede}</p>}
      </div>
    </header>
  );
}
export function Price({ cents, currency, locale, from, label }:
  { cents: number; currency: string; locale: Locale; from?: string; label?: string }) {
  return (
    <span className="price">
      {from ? `${from} ` : ''}{formatMoney(cents, currency, locale)}
      {label && <small>{label}</small>}
    </span>
  );
}
export function Badge({ children, accent }: { children: ReactNode; accent?: boolean }) {
  return <span className={`badge ${accent ? 'badge--accent' : ''}`}>{children}</span>;
}
