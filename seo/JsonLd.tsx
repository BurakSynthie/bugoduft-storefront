// Server component: injects JSON-LD. Content must mirror what the page shows.
// §O Safe serialization: JSON.stringify does NOT escape "<", so a stored value containing
// "</script>" could break out of the script element (XSS / markup corruption). Escape the
// characters required to keep the payload inside the <script> block. This is defensive even
// though schema is built from controlled/localized values — stored content flows through here.
function safeJsonLd(data: object | object[]): string {
  return JSON.stringify(Array.isArray(data) ? data : [data])
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}
export default function JsonLd({ data }: { data: object | object[] }) {
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: safeJsonLd(data) }} />;
}
