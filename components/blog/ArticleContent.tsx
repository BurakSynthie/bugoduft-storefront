import Link from 'next/link';
import type { BlogBlock } from '@/lib/blog/content';

// Renders the structured, sanitized block array. No dangerouslySetInnerHTML anywhere —
// each block maps to a fixed React element, so stored content can never inject markup.
export default function ArticleContent({ blocks }: { blocks: BlogBlock[] }) {
  return (
    <div className="article__body" style={{ maxWidth: '70ch' }}>
      {blocks.map((b, i) => {
        switch (b.type) {
          case 'paragraph':
            return <p className="muted" key={i} style={{ marginTop: 'var(--s-4)', lineHeight: 1.7 }}>{b.text}</p>;
          case 'h2':
            return <h2 key={i} style={{ marginTop: 'var(--s-6)' }}>{b.text}</h2>;
          case 'h3':
            return <h3 key={i} style={{ marginTop: 'var(--s-5)' }}>{b.text}</h3>;
          case 'bullets':
            return <ul key={i} style={{ marginTop: 'var(--s-4)', paddingLeft: '1.2rem' }}>
              {b.items.map((it, j) => <li className="muted" key={j} style={{ marginTop: '.3rem' }}>{it}</li>)}
            </ul>;
          case 'numbers':
            return <ol key={i} style={{ marginTop: 'var(--s-4)', paddingLeft: '1.2rem' }}>
              {b.items.map((it, j) => <li className="muted" key={j} style={{ marginTop: '.3rem' }}>{it}</li>)}
            </ol>;
          case 'quote':
            return <blockquote key={i} style={{ marginTop: 'var(--s-5)', paddingLeft: '1rem', borderLeft: '3px solid var(--line, #e5e5e5)', fontStyle: 'italic' }}>{b.text}</blockquote>;
          case 'image':
            return <figure key={i} style={{ margin: 'var(--s-6) 0' }}>
              <img src={b.url} alt={b.alt} loading="lazy" style={{ width: '100%', height: 'auto', borderRadius: '12px' }} />
              {b.caption && <figcaption className="muted" style={{ fontSize: '.82rem', marginTop: '.4rem', textAlign: 'center' }}>{b.caption}</figcaption>}
            </figure>;
          case 'cta':
            return b.external
              ? <p key={i} style={{ marginTop: 'var(--s-5)' }}><a className="btn btn--primary" href={b.href} target="_blank" rel="noopener noreferrer">{b.label}</a></p>
              : <p key={i} style={{ marginTop: 'var(--s-5)' }}><Link className="btn btn--primary" href={b.href}>{b.label}</Link></p>;
          default:
            return null;
        }
      })}
    </div>
  );
}
