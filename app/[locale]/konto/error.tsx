'use client';
// §5 Controlled failure for customer account pages. When an order/quote read fails closed
// (throws instead of silently returning empty), this boundary shows a neutral, friendly
// message and a retry — it never renders the underlying error text, so internal DB details
// are never leaked to the customer UI. The thrown Error messages are generic tokens anyway
// (see lib/customer/session.ts), and Next.js scrubs error details in production.
import { useEffect } from 'react';

export default function AccountError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => { console.error('[account] render error:', error?.digest ?? error?.message); }, [error]);
  return (
    <section className="section">
      <div className="container" style={{ maxWidth: 560, textAlign: 'center', padding: 'var(--s-6) 0' }}>
        <h1 style={{ fontSize: 'var(--t-h3, 1.4rem)' }}>Ein Fehler ist aufgetreten</h1>
        <p className="muted" style={{ marginTop: 'var(--s-3)' }}>
          Ihre Daten konnten momentan nicht geladen werden. Bitte versuchen Sie es erneut.
          {' '}An error occurred while loading your account data. Please try again.
          {' '}Une erreur s’est produite lors du chargement. Veuillez réessayer.
        </p>
        <button className="btn btn--primary" style={{ marginTop: 'var(--s-4)' }} onClick={() => reset()}>
          Erneut versuchen · Retry · Réessayer
        </button>
      </div>
    </section>
  );
}
