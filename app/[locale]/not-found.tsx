import Link from 'next/link';
import { Container } from '@/components/ui';

// §v1.2.6 not-found for the storefront root layout.
// IMPORTANT (root-cause of the admin DOM-duplication bug): this boundary must NOT render its own
// document elements. The storefront ROOT layout (app/[locale]/layout.tsx) owns the document; this
// boundary only supplies the page content, exactly like every other page under [locale]. The
// previous app/not-found.tsx rendered a second document root, which — combined with the old
// pass-through app/layout.tsx — produced invalid nested document elements. notFound() thrown in
// any /[locale]/* route now renders this within the single storefront document + chrome.
export default function NotFound() {
  return (
    <section className="section">
      <Container>
        <div style={{ textAlign: 'center' }}>
          <span className="eyebrow" style={{ justifyContent: 'center' }}>404</span>
          <h1 style={{ fontSize: 'var(--t-h2)', marginTop: 'var(--s-3)' }}>Seite nicht gefunden</h1>
          <p className="lede" style={{ marginInline: 'auto' }}>Die angeforderte Seite existiert nicht.</p>
          <p style={{ marginTop: 'var(--s-6)' }}>
            <Link className="btn btn--primary" href="/de">Zur Startseite</Link>
          </p>
        </div>
      </Container>
    </section>
  );
}
