import type { Locale } from '@/i18n/config';
import type { ArtworkRef, Intensity, ShapeId } from './types';

// -----------------------------------------------------------------------------
// Configurator draft persistence.
//
// localStorage holds ONLY safe, serializable state — never file binaries, blob
// URLs, or secrets. File binaries live in an in-memory registry keyed by the
// stable configId; they survive client navigation within a session but not a
// full reload (that is expected — after a reload we still recover all metadata
// and, when a real upload already happened, the storage path references).
// -----------------------------------------------------------------------------

export type FileMeta = { name: string; type: string; size: number };

export type CfgDraft = {
  v: 1;
  configId: string;
  collectionCode?: string;
  quantity: number;
  qtyText: string;
  scentCode: string | null;
  scentCat: string;
  intensity: Intensity;
  shape: ShapeId;
  frontMeta: FileMeta | null;
  frontNotes: string;
  sameBack: boolean;
  backMeta: FileMeta | null;
  backNotes: string;
  supportingMeta: FileMeta[];
  step: number;
  locale: Locale;
  updatedAt: number;
};

const DRAFT_KEY = 'bugo_cfg_draft';
const LIVE_KEY = 'bugo_cfg_live';   // sessionStorage: marks an active configurator session

export function newConfigId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `cfg-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function loadDraft(): CfgDraft | null {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    if (!raw) return null;
    const d = JSON.parse(raw) as CfgDraft;
    if (!d || d.v !== 1 || !d.configId) return null;
    return d;
  } catch { return null; }
}

export function saveDraft(d: CfgDraft): void {
  try { localStorage.setItem(DRAFT_KEY, JSON.stringify(d)); } catch { /* quota / disabled */ }
}

export function clearDraft(): void {
  try { localStorage.removeItem(DRAFT_KEY); } catch { /* noop */ }
}

// A draft worth offering to recover (not just untouched defaults).
export function isMeaningful(d: CfgDraft | null): boolean {
  if (!d) return false;
  return Boolean(
    d.step > 0 || d.scentCode || d.frontMeta || d.frontNotes.trim() ||
    d.backMeta || d.backNotes.trim() || d.supportingMeta.length || (d.quantity && d.quantity !== 1000),
  );
}

// session "live" flag — distinguishes continuation (nav / language switch / refresh)
// from returning in a fresh session (browser reopened).
export function getLive(): string | null {
  try { return sessionStorage.getItem(LIVE_KEY); } catch { return null; }
}
export function setLive(configId: string): void {
  try { sessionStorage.setItem(LIVE_KEY, configId); } catch { /* noop */ }
}
export function clearLive(): void {
  try { sessionStorage.removeItem(LIVE_KEY); } catch { /* noop */ }
}

// -----------------------------------------------------------------------------
// In-memory file registry (binaries never touch localStorage).
// -----------------------------------------------------------------------------
type FileSlot = { front: File | null; back: File | null; supporting: (File | null)[] };
const registry = new Map<string, FileSlot>();

function slot(configId: string): FileSlot {
  let s = registry.get(configId);
  if (!s) { s = { front: null, back: null, supporting: [] }; registry.set(configId, s); }
  return s;
}
export function setFrontFile(configId: string, f: File | null) { slot(configId).front = f; }
export function setBackFile(configId: string, f: File | null) { slot(configId).back = f; }
export function setSupportingFiles(configId: string, files: (File | null)[]) { slot(configId).supporting = files; }
export function getFiles(configId: string): FileSlot { return slot(configId); }
export function hasSessionFiles(configId: string): boolean {
  const s = registry.get(configId);
  return Boolean(s && (s.front || s.back || s.supporting.some(Boolean)));
}

export const metaOf = (r: ArtworkRef | null): FileMeta | null =>
  r ? { name: r.name, type: r.type, size: r.size } : null;

// Rebuild an ArtworkRef from persisted metadata (no binary after reload).
export function refFromMeta(m: FileMeta | null): ArtworkRef | null {
  return m ? { name: m.name, type: m.type, size: m.size, previewUrl: null, storagePath: null, file: null } : null;
}
