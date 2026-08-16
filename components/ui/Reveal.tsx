'use client';
import { useEffect, useRef, useState, type ReactNode } from 'react';
// Efficient scroll reveal via IntersectionObserver; respects reduced motion via CSS.
export default function Reveal({ children, as: Tag = 'div', className = '' }:
  { children: ReactNode; as?: any; className?: string }) {
  const ref = useRef<HTMLElement>(null);
  const [seen, setSeen] = useState(false);
  useEffect(() => {
    const el = ref.current; if (!el || seen) return;
    const io = new IntersectionObserver((entries) => {
      entries.forEach(e => { if (e.isIntersecting) { setSeen(true); io.disconnect(); } });
    }, { rootMargin: '0px 0px -10% 0px' });
    io.observe(el); return () => io.disconnect();
  }, [seen]);
  return <Tag ref={ref} className={`reveal ${seen ? 'in' : ''} ${className}`}>{children}</Tag>;
}
