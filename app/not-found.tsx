import Link from 'next/link';
import './globals.css';
export default function NotFound() {
  return (
    <html lang="de"><body>
      <main className="container section" style={{ textAlign:'center' }}>
        <span className="eyebrow" style={{ justifyContent:'center' }}>404</span>
        <h1 style={{ fontSize:'var(--t-h2)', marginTop:'var(--s-3)' }}>Seite nicht gefunden</h1>
        <p className="lede" style={{ marginInline:'auto' }}>Die angeforderte Seite existiert nicht.</p>
        <p style={{ marginTop:'var(--s-6)' }}><Link className="btn btn--primary" href="/de">Zur Startseite</Link></p>
      </main>
    </body></html>
  );
}
