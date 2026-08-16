import type { ShapeId } from './types';
// Geometric die-cut shapes drawn in a 100x120 viewBox (portrait hanging tag).
// Deferred shapes (bugo_decides / custom_contour) intentionally have no geometry:
// the browser must NOT fake a production contour — final shape is prepared by BUGO.
export const SHAPES: { id: ShapeId; labelDe: string; deferred?: boolean }[] = [
  { id:'rectangle', labelDe:'Rechteck' },
  { id:'square',    labelDe:'Quadrat' },
  { id:'round',     labelDe:'Rund' },
  { id:'oval',      labelDe:'Oval' },
  { id:'shield',    labelDe:'Wappen' },
  { id:'heart',     labelDe:'Herz' },
  { id:'bugo_decides',  labelDe:'Form von BUGO bestimmen lassen', deferred:true },
  { id:'custom_contour', labelDe:'Individuelle Kontur', deferred:true },
];
export const isDeferred = (id: ShapeId) => id === 'bugo_decides' || id === 'custom_contour';

// Path/element for a shape inside viewBox 0 0 100 120. Used for BOTH clip + outline,
// so front and back always share the exact same outer die-cut.
export function shapeGeometry(id: ShapeId): JSX.Element | null {
  switch (id) {
    case 'rectangle': return <rect x="8" y="6" width="84" height="108" rx="8" />;
    case 'square':    return <rect x="14" y="26" width="72" height="72" rx="6" />;
    case 'round':     return <circle cx="50" cy="60" r="40" />;
    case 'oval':      return <ellipse cx="50" cy="60" rx="34" ry="48" />;
    case 'shield':    return <path d="M50 6 L90 20 V62 C90 90 70 106 50 114 C30 106 10 90 10 62 V20 Z" />;
    case 'heart':     return <path d="M50 112 C8 82 10 40 34 34 C44 31 50 40 50 46 C50 40 56 31 66 34 C90 40 92 82 50 112 Z" />;
    default:          return null; // deferred
  }
}
