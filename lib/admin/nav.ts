// Single source of truth for Admin navigation (desktop sidebar + mobile sheet).
// Only real, built routes appear. Blog/Yorumlar are intentionally omitted until built,
// so nothing is active on one surface and disabled on the other.
export type AdminNavItem = { label: string; href: string };
export type AdminNavGroup = { group: string; items: AdminNavItem[] };

export const ADMIN_NAV: AdminNavGroup[] = [
  { group: 'Genel', items: [{ label: 'Panel', href: '/admin' }] },
  { group: 'Katalog', items: [
    { label: 'Ürünler', href: '/admin/urunler' },
    { label: 'Medya', href: '/admin/medya' },
    { label: 'Koleksiyonlar', href: '/admin/koleksiyonlar' },
    { label: 'Kokular', href: '/admin/kokular' },
  ] },
  { group: 'İçerik', items: [
    { label: 'Ana Sayfa', href: '/admin/ana-sayfa' },
    { label: 'Blog', href: '/admin/blog' },
    { label: 'Çeviriler', href: '/admin/ceviriler' },
    { label: 'SEO', href: '/admin/seo' },
  ] },
  { group: 'Operasyon', items: [
    { label: 'Siparişler', href: '/admin/siparisler' },
    { label: 'Teklifler', href: '/admin/teklifler' },
    { label: 'Ayarlar', href: '/admin/ayarlar' },
    { label: 'Entegrasyonlar', href: '/admin/entegrasyonlar' },
  ] },
];
// Mobile sheet excludes the bottom-bar "Panel" entry.
export const ADMIN_NAV_SHEET: AdminNavGroup[] = ADMIN_NAV.filter(g => g.group !== 'Genel');
