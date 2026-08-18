'use server';
import { saveCollection, reorderCollection, deleteCollection } from '@/repositories/admin-collections';
import type { EditableCollection, CollectionResult } from '@/lib/collections/model';
export async function saveCollectionAction(input: EditableCollection): Promise<CollectionResult> { return saveCollection(input); }
export async function reorderCollectionAction(id: string, dir: -1 | 1): Promise<CollectionResult> { return reorderCollection(id, dir); }
export async function deleteCollectionAction(id: string): Promise<CollectionResult> { return deleteCollection(id); }
