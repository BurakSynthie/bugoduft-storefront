'use client';
import { useEffect, useRef } from 'react';

// Decorative process video: autoplay, muted, loop, playsInline, NO controls, never
// audible. IntersectionObserver plays only when near-visible and pauses off-screen.
// Respects prefers-reduced-motion (shows poster, no motion).
export default function ProdVideo({ src, poster, label }: { src: string; poster?: string | null; label: string }) {
  const ref = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const v = ref.current;
    if (!v) return;
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (reduce) return;                                    // keep still: poster only
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) {
        if (e.isIntersecting) { v.play().catch(() => {}); }
        else { v.pause(); }
      }
    }, { rootMargin: '200px', threshold: 0.25 });
    io.observe(v);
    return () => io.disconnect();
  }, []);

  return (
    <video ref={ref} muted loop playsInline autoPlay preload="none"
      poster={poster ?? undefined} aria-label={label} tabIndex={-1}>
      <source src={src} />
    </video>
  );
}
