// Server component: injects JSON-LD. Content must mirror what the page shows.
export default function JsonLd({ data }: { data: object | object[] }) {
  const json = JSON.stringify(Array.isArray(data) ? data : [data]);
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: json }} />;
}
