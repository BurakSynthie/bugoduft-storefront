export default function AnnouncementBar({ text }: { text: string }) {
  if (!text) return null;
  return <div className="ann" role="region" aria-label="Ankündigung">{text}</div>;
}
