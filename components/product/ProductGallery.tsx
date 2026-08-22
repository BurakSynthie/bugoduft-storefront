'use client';
import { useState } from 'react';

// §5 Product gallery: thumbnails now switch the large main media (client-side, no reload,
// no navigation, no layout shift). Preserves the existing .pdp__visual / .pdp__cover /
// .pdp__gallery / .pdp__thumb design. Video media is supported (muted/autoplay/playsInline,
// per current design) and stops when switched away because React unmounts the element.
type Media = { type: 'image' | 'video'; src: string; alt: string | null };
const isVideo = (s: string) => /\.(mp4|webm|mov|m4v)(\?|#|$)/i.test(s);

export default function ProductGallery({ cover, coverAlt, gallery, galleryAlt, collectionCode, name }:
  { cover: string | null; coverAlt: string | null; gallery: string[]; galleryAlt?: (string | null)[]; collectionCode: string; name: string }) {
  const media: Media[] = [];
  if (cover) media.push({ type: isVideo(cover) ? 'video' : 'image', src: cover, alt: coverAlt });
  // §10 each gallery image carries its own locale-specific ALT (alt_de/en/fr resolved server-side).
  gallery.forEach((g, idx) => media.push({ type: isVideo(g) ? 'video' : 'image', src: g, alt: galleryAlt?.[idx] ?? null }));

  const [i, setI] = useState(0);
  const active = media[i];
  // The active large image renders with ITS OWN ALT; fall back to the product name so the
  // main product visual is never alt-less. Thumbnails stay decorative (empty alt).
  const activeAlt = active?.alt || name;

  return (
    <>
      <div className="hero__visual pdp__visual" data-c={collectionCode} aria-hidden={media.length === 0}>
        {!active
          ? <div className="hero__tag"><small>Your logo</small><b>{collectionCode}</b></div>
          : active.type === 'video'
            ? <video className="pdp__cover" src={active.src} autoPlay muted playsInline loop />
            : <img className="pdp__cover" src={active.src} alt={activeAlt} />}
      </div>
      {media.length > 1 && (
        <div className="pdp__gallery" role="tablist" aria-label={name}>
          {media.map((m, idx) => (
            <button
              key={idx}
              type="button"
              role="tab"
              aria-selected={idx === i}
              aria-label={`${name} ${idx + 1}`}
              className={`pdp__thumb${idx === i ? ' is-active' : ''}`}
              onClick={() => setI(idx)}
            >
              {m.type === 'video'
                ? <video src={m.src} muted playsInline preload="metadata" aria-hidden="true" />
                : <img src={m.src} alt="" loading="lazy" aria-hidden="true" />}
            </button>
          ))}
        </div>
      )}
    </>
  );
}
