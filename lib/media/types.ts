export type MediaType = 'image' | 'video';

export type MediaRecord = {
  id: string;
  storagePath: string;
  url: string;                 // public URL (cms-media bucket)
  mediaType: MediaType;
  mimeType: string;
  originalFilename: string | null;
  sizeBytes: number | null;
  width: number | null;
  height: number | null;
  altDe: string | null;
  altEn: string | null;
  altFr: string | null;
  createdAt: string;
};

export const CMS_BUCKET = 'cms-media';
export const MEDIA_MAX_BYTES = 50 * 1024 * 1024;   // matches bucket file_size_limit
export const MEDIA_IMAGE_MIME = ['image/jpeg', 'image/png', 'image/webp'];
export const MEDIA_VIDEO_MIME = ['video/mp4', 'video/webm'];
export const MEDIA_ALLOWED_MIME = [...MEDIA_IMAGE_MIME, ...MEDIA_VIDEO_MIME];
