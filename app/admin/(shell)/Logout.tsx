'use client';
import { useRouter } from 'next/navigation';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
export default function Logout() {
  const router = useRouter();
  async function out(){ const sb=createSupabaseBrowserClient(); if(sb) await sb.auth.signOut(); router.replace('/admin/giris'); router.refresh(); }
  return <button onClick={out} className="adm__nav" style={{background:'none',border:0,color:'#8B93A2',cursor:'pointer',padding:'.55rem .7rem',font:'inherit',fontSize:'.85rem'}}>Çıkış</button>;
}
