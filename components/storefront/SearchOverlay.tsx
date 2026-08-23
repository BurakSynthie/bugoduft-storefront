'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useStorefront } from '@/lib/cart/store';
import { buildIndex, runSearch, type SearchEntry, type SearchKind } from '@/lib/search';
import { sf } from '@/lib/i18n/storefront';
import { IconSearch } from '@/components/ui/icons';
import type { Locale } from '@/i18n/config';

export default function SearchOverlay({ locale }: { locale: Locale }) {
  const { overlay, close } = useStorefront();
  const router = useRouter();
  const t = sf(locale);
  const open = overlay === 'search';
  const [q, setQ] = useState('');
  const [dynamicIndustries, setDynamicIndustries] = useState<SearchEntry[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const index = useMemo(() => [...buildIndex(locale), ...dynamicIndustries], [locale, dynamicIndustries]);
  const results = useMemo(() => runSearch(index, q), [index, q]);

  useEffect(() => {
    const controller = new AbortController();

    fetch(`/api/search/industries?locale=${encodeURIComponent(locale)}`, {
      signal: controller.signal,
      cache: 'no-store',
    })
      .then(r => r.ok ? r.json() : [])
      .then((rows: SearchEntry[]) => {
        setDynamicIndustries(Array.isArray(rows) ? rows : []);
      })
      .catch(err => {
        if (err?.name !== 'AbortError') setDynamicIndustries([]);
      });

    return () => controller.abort();
  }, [locale]);

  useEffect(() => {
    if (!open) return;
    setQ('');
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
    document.addEventListener('keydown', onKey);
    const id = setTimeout(() => inputRef.current?.focus(), 30);
    return () => { document.removeEventListener('keydown', onKey); clearTimeout(id); };
  }, [open, close]);

  const go = (href: string) => { close(); router.push(href); };

  const groups: { kind: SearchKind; label: string }[] = [
    { kind: 'products', label: t.resultProducts },
    { kind: 'scents', label: t.resultScents },
    { kind: 'faq', label: t.resultFaq },
    { kind: 'pages', label: t.resultPages },
  ];
  const byKind = (k: SearchKind): SearchEntry[] => results.filter(r => r.kind === k);

  return (
    <div className={`sfmodal${open ? ' is-open' : ''}`} aria-hidden={!open}>
      <div className="sfmodal__scrim" onClick={close} />
      <div className="sfmodal__panel sfsearch" role="dialog" aria-modal="true" aria-label={t.search}>
        <div className="sfsearch__bar">
          <IconSearch size={20} />
          <input ref={inputRef} className="sfsearch__input" type="search" value={q}
            onChange={e => setQ(e.target.value)} placeholder={t.searchPh}
            aria-label={t.search} autoComplete="off" enterKeyHint="search"
            onKeyDown={e => { if (e.key === 'Enter' && results[0]) go(results[0].href); }} />
          <button className="sficon" aria-label={t.close} onClick={close}>×</button>
        </div>

        <div className="sfsearch__results">
          {!q.trim() && <p className="sfsearch__hint muted">{t.searchHint}</p>}
          {q.trim() && results.length === 0 && <p className="sfsearch__hint muted">{t.searchEmpty}</p>}
          {results.length > 0 && groups.map(g => {
            const rows = byKind(g.kind);
            if (!rows.length) return null;
            return (
              <div className="sfsearch__group" key={g.kind}>
                <div className="sfsearch__glabel">{g.label}</div>
                <ul>
                  {rows.map((r, i) => (
                    <li key={`${g.kind}-${i}`}>
                      <button className="sfsearch__row" onClick={() => go(r.href)}>
                        <span className="sfsearch__title">{r.title}</span>
                        {r.sub && <span className="sfsearch__sub muted">{r.sub}</span>}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
