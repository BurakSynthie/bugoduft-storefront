'use server';
import { saveScent, reorderScent, deleteScent } from '@/repositories/admin-scents';
import type { EditableScent, ScentResult } from '@/lib/scents/model';
export async function saveScentAction(input: EditableScent): Promise<ScentResult> { return saveScent(input); }
export async function reorderScentAction(id: string, dir: -1 | 1): Promise<ScentResult> { return reorderScent(id, dir); }
export async function deleteScentAction(id: string, code: string): Promise<ScentResult> { return deleteScent(id, code); }
