'use server';
import { requireAdmin } from '@/lib/supabase/admin-auth';
import { updateOpStatus, approveDesign, setTracking, saveNotes, signedArtworkUrl, type OpStatus } from '@/repositories/orders';
import { revalidatePath } from 'next/cache';

export async function actSetStatus(id:string, status:OpStatus){ await requireAdmin(); const r=await updateOpStatus(id,status); revalidatePath(`/admin/siparisler/${id}`); return r; }
export async function actApprove(id:string){ await requireAdmin(); const r=await approveDesign(id); revalidatePath(`/admin/siparisler/${id}`); return r; }
export async function actTracking(id:string, tracking:string){ await requireAdmin(); if(!tracking.trim()) return {ok:false as const}; const r=await setTracking(id,tracking.trim()); revalidatePath(`/admin/siparisler/${id}`); return r; }
export async function actNotes(id:string, notes:string){ await requireAdmin(); const r=await saveNotes(id,notes); revalidatePath(`/admin/siparisler/${id}`); return r; }
export async function actArtworkUrl(path:string){ await requireAdmin(); return signedArtworkUrl(path); }
