'use client';
import { useMemo, useState } from 'react';
import type { Locale } from '@/i18n/config';
import { Container, SectionHeader } from '@/components/ui';

type Scent = { code: string; category: string; name: string; description: string };
const catLabels: Record<Locale, Record<string,string>> = {
  de: { all:'Alle', frisch:'Frisch', fruchtig:'Fruchtig', suess:'Süß', elegant:'Elegant', intensiv:'Intensiv' },
  en: { all:'All', frisch:'Fresh', fruchtig:'Fruity', suess:'Sweet', elegant:'Elegant', intensiv:'Intense' },
  fr: { all:'Tous', frisch:'Frais', fruchtig:'Fruité', suess:'Sucré', elegant:'Élégant', intensiv:'Intense' },
};
export default function Scents({ locale, scents, heading }:
  { locale: Locale; scents: Scent[]; heading: { eyebrow:string; title:string; lede:string } }) {
  const [cat, setCat] = useState('all');
  const cats = ['all','frisch','fruchtig','suess','elegant','intensiv'];
  const shown = useMemo(() => cat === 'all' ? scents : scents.filter(s => s.category === cat), [cat, scents]);
  return (
    <section className="section" id="duefte">
      <Container>
        <SectionHeader eyebrow={heading.eyebrow} title={heading.title} lede={heading.lede} />
        <div className="chips" role="group" aria-label="Filter">
          {cats.map(c => (
            <button key={c} className="chip" aria-pressed={cat === c} onClick={() => setCat(c)}>
              {catLabels[locale][c]}
            </button>
          ))}
        </div>
        <div className="scentgrid mt-6">
          {shown.map(s => (
            <div className="scent" key={s.code}>
              <b>{s.name}</b>
              <small>{s.description}</small>
            </div>
          ))}
        </div>
      </Container>
    </section>
  );
}
