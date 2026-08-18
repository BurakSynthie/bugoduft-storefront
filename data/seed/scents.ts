import type { ScentSeed } from '../types';
const s = (code:string, category:ScentSeed['category'], de:[string,string], en:[string,string], fr:[string,string]):ScentSeed => ({
  code, category, isActive:true,
  tr:{ de:{name:de[0],description:de[1]}, en:{name:en[0],description:en[1]}, fr:{name:fr[0],description:fr[1]} }
});
// §5: the real customer-facing catalogue is the 40 fragrances in migration 0012 (DB only).
// The obsolete 10-scent bootstrap list was removed here so that Supabase-UNCONFIGURED dev
// (or a transient DB read error) never falls back to stale scents. We intentionally do NOT
// duplicate the 40 scents into the seed — production reads them from the DB. Dev without
// Supabase simply shows no seed scents (honest empty) rather than obsolete ones.
export const scents: ScentSeed[] = [];
