import type { ReactNode } from 'react';
import '../globals.css';
import './admin.css';
// Shared admin document only. Sidebar/nav/identity live in the authenticated (shell) layout,
// so /admin/giris renders as a bare centered login with no protected chrome.
export const metadata = { title: 'BUGO DUFT · Yönetim', robots: { index:false, follow:false } };
export default function AdminRootLayout({ children }: { children: ReactNode }) {
  return (<html lang="tr"><body>{children}</body></html>);
}
