import Link from 'next/link';
export default function AnnouncementBar({ text, href, linkLabel }: { text: string; href?: string; linkLabel?: string }) {
  if (!text) return null;
  return (
    <div className="ann" role="region" aria-label="Ankündigung">
      <span>{text}</span>
      {href && linkLabel && <Link href={href} className="ann__link">{linkLabel}</Link>}
    </div>
  );
}
