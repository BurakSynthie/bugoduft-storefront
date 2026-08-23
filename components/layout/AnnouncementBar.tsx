import Link from 'next/link';

function AnnouncementIcon() {
  return (
    <span className="ann__iconWrap" aria-hidden="true">
      <span className="ann__icon">
        <svg viewBox="0 0 24 24" fill="none">
          <path
            d="M4.5 8.2h9.1c1.7 0 2.7-.9 2.7-2.1 0-1.1-.8-1.9-1.9-1.9-.9 0-1.6.4-2 1.1"
            stroke="currentColor"
            strokeWidth="2.2"
            strokeLinecap="round"
          />
          <path
            d="M4.5 12h13.2"
            stroke="currentColor"
            strokeWidth="2.2"
            strokeLinecap="round"
          />
          <path
            d="M4.5 15.8h9.1c1.7 0 2.7.9 2.7 2.1 0 1.1-.8 1.9-1.9 1.9-.9 0-1.6-.4-2-1.1"
            stroke="currentColor"
            strokeWidth="2.2"
            strokeLinecap="round"
          />
        </svg>
      </span>
      <span className="ann__divider" />
    </span>
  );
}

export default function AnnouncementBar({
  text,
  href,
  linkLabel,
}: {
  text: string;
  href?: string;
  linkLabel?: string;
}) {
  if (!text) return null;

  return (
    <div className="ann" role="region" aria-label="Announcement">
      <div className="ann__inner">
        <AnnouncementIcon />

        <span className="ann__message">{text}</span>

        {href && linkLabel && (
          <Link href={href} className="ann__link">
            <span>{linkLabel}</span>
            <svg viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <path d="M3 8h9M8.5 4.5 12 8l-3.5 3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </Link>
        )}
      </div>
    </div>
  );
}
