'use client';
import { useEffect, useRef } from 'react';
export default function IndustriesSlider({ items }:{ items:{name:string}[] }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current; if (!el) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    let raf = 0, paused = false;
    const pause = () => { paused = true; }; const resume = () => { paused = false; };
    el.addEventListener('pointerenter', pause); el.addEventListener('pointerdown', pause);
    el.addEventListener('pointerleave', resume); el.addEventListener('focusin', pause); el.addEventListener('focusout', resume);
    let last = performance.now();
    const tick = (now:number) => {
      const dt = now - last; last = now;
      if (!paused && el.scrollWidth > el.clientWidth + 4) {
        el.scrollLeft += dt * 0.03;                         // slow, premium
        if (el.scrollLeft >= el.scrollWidth - el.clientWidth - 1) el.scrollLeft = 0;  // continuous loop
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => { cancelAnimationFrame(raf);
      el.removeEventListener('pointerenter', pause); el.removeEventListener('pointerdown', pause);
      el.removeEventListener('pointerleave', resume); el.removeEventListener('focusin', pause); el.removeEventListener('focusout', resume); };
  }, []);
  return (
    <div className="hscroll" role="list" ref={ref}>
      {items.concat(items).map((i,idx) => (
        <div className="indcard" role="listitem" key={idx}><span className="indcard__dot" aria-hidden="true" /><b>{i.name}</b></div>
      ))}
    </div>
  );
}
