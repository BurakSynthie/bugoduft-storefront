import { requireAdmin } from '@/lib/supabase/admin-auth';
import { isSupabaseConfigured } from '@/lib/supabase/env';
import { isAdminConfigured, isWebhookConfigured } from '@/config/shopify-admin';
import { isShopifyConfigured, shopifyEnv } from '@/config/shopify';
import { getSettings } from '@/repositories/settings';
import IntegrationsEditor from './IntegrationsEditor';

export const metadata = { title: 'Entegrasyonlar · BUGO DUFT' };
export const dynamic = 'force-dynamic';

export default async function AdminIntegrations() {
  await requireAdmin();
  const settings = await getSettings();
  // Only booleans/domain — NEVER tokens or secrets — cross the server boundary.
  const status = {
    supabase: isSupabaseConfigured(),
    shopifyStorefront: isShopifyConfigured(),
    shopifyAdmin: isAdminConfigured(),
    shopifyWebhook: isWebhookConfigured(),
    shopifyDomain: shopifyEnv.domain || '',
  };
  return (
    <>
      <div className="adm__top"><div><h1>Entegrasyonlar</h1><div className="adm__crumb">Analiz, izleme ve servis durumu</div></div></div>
      <IntegrationsEditor initial={settings} status={status} configured={isSupabaseConfigured()} />
    </>
  );
}
