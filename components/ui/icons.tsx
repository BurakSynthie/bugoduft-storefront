// Inline SVG icons (consistent stroke set). Server-safe.
type P = { size?: number };
const S = ({ size = 20, d }: P & { d: string }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d={d} />
  </svg>
);
export const IconSearch = (p: P) => <S {...p} d="M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16Zm10 2-4.3-4.3" />;
export const IconCart = (p: P) => <S {...p} d="M3 4h2l2.4 12.4a1 1 0 0 0 1 .8h9.2a1 1 0 0 0 1-.8L21 8H6M10 21h.01M17 21h.01" />;
export const IconMenu = (p: P) => <S {...p} d="M3 6h18M3 12h18M3 18h18" />;
export const IconHome = (p: P) => <S {...p} d="M3 11 12 3l9 8M5 10v10h14V10" />;
export const IconGrid = (p: P) => <S {...p} d="M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z" />;
export const IconSpark = (p: P) => <S {...p} d="M12 3v18M3 12h18M6 6l12 12M18 6 6 18" />;
export const IconDrop = (p: P) => <S {...p} d="M12 3s6 6.5 6 11a6 6 0 0 1-12 0c0-4.5 6-11 6-11Z" />;
export const IconCheck = (p: P) => <S {...p} d="M20 6 9 17l-5-5" />;
export const IconArrow = (p: P) => <S {...p} d="M5 12h14M13 6l6 6-6 6" />;
