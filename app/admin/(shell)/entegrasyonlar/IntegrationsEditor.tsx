'use client';
import { useState } from 'react';
import type { SiteSettings } from '@/lib/settings/model';
import { saveSettingsAction } from '../ayarlar/actions';

type Status = { supabase: boolean; shopifyStorefront: boolean; shopifyAdmin: boolean; shopifyWebhook: boolean; shopifyDomain: string };
const Dot = ({ ok }: { ok: boolean }) => (
  <span style={{ display:'inline-flex', alignItems:'center', gap:'.4rem' }}>
    <span style={{ width:9, height:9, borderRadius:'50%', background: ok ? '#12B76A' : '#B42318', display:'inline-block' }} />
    {ok ? 'Yapılandırıldı' : 'Eksik'}
  </span>
);

export default function IntegrationsEditor({ initial, status, configured }:
  { initial: SiteSettings; status: Status; configured: boolean }) {
  const [s, setS] = useState<SiteSettings>(initial);
  const [msg, setMsg] = useState('');
  const [saving, setSaving] = useState(false);
  const ig = s.integrations;
  const setIg = (patch: Partial<SiteSettings['integrations']>) => setS(v => ({ ...v, integrations: { ...v.integrations, ...patch } }));

  async function save() {
    if (!configured) { setMsg('Supabase yapılandırılmadan kaydedilemez.'); return; }
    setSaving(true); setMsg('');
    const r = await saveSettingsAction(s);
    setSaving(false);
    setMsg(r.ok ? 'Kaydedildi.' : (r.message || 'Kaydedilemedi.'));
  }

  return (
    <div className="adm-stack">
      <div className="adm-panel">
        <strong>Analiz & İzleme (herkese açık kimlikler)</strong>
        <p className="muted" style={{ fontSize:'.82rem', marginTop:'.25rem' }}>
          Yalnızca herkese açık kimlikler saklanır. Gizli anahtarlar burada tutulmaz. Betikler yalnızca etkin ve yapılandırılmışsa ve çerez onayı verildiğinde yüklenir.
        </p>
        <div className="adm-grid2" style={{ marginTop:'var(--s-3)' }}>
          <div className="field">
            <label>Google Analytics 4 – Ölçüm Kimliği (G-XXXXXXX)</label>
            <input className="input" value={ig.ga4Id} onChange={e=>setIg({ ga4Id:e.target.value })} placeholder="G-XXXXXXXXXX" />
            <label style={{ display:'inline-flex', gap:'.4rem', alignItems:'center', marginTop:'.4rem' }}>
              <input type="checkbox" checked={ig.ga4Enabled} onChange={e=>setIg({ ga4Enabled:e.target.checked })} /> Etkin
            </label>
          </div>
          <div className="field">
            <label>Google Tag Manager – Konteyner Kimliği (GTM-XXXX)</label>
            <input className="input" value={ig.gtmId} onChange={e=>setIg({ gtmId:e.target.value })} placeholder="GTM-XXXXXXX" />
            <label style={{ display:'inline-flex', gap:'.4rem', alignItems:'center', marginTop:'.4rem' }}>
              <input type="checkbox" checked={ig.gtmEnabled} onChange={e=>setIg({ gtmEnabled:e.target.checked })} /> Etkin
            </label>
          </div>
          <div className="field">
            <label>Meta Pixel Kimliği</label>
            <input className="input" value={ig.metaPixelId} onChange={e=>setIg({ metaPixelId:e.target.value })} placeholder="123456789012345" />
            <label style={{ display:'inline-flex', gap:'.4rem', alignItems:'center', marginTop:'.4rem' }}>
              <input type="checkbox" checked={ig.metaEnabled} onChange={e=>setIg({ metaEnabled:e.target.checked })} /> Etkin
            </label>
          </div>
          <div className="field">
            <label>Google Search Console – doğrulama kodu</label>
            <input className="input" value={ig.searchConsole} onChange={e=>setIg({ searchConsole:e.target.value })} placeholder="google-site-verification içeriği" />
            <small className="muted">Yalnızca doğrulama meta etiketi eklenir; raporlama entegrasyonu yoktur.</small>
          </div>
          <div className="field">
            <label>Analitik modu</label>
            <select className="input" value={ig.analyticsMode} onChange={e=>setIg({ analyticsMode: e.target.value === 'gtm' ? 'gtm' : 'direct' })}>
              <option value="direct">Doğrudan GA4</option>
              <option value="gtm">GTM ile yönetilen</option>
            </select>
            <small className="muted">GTM modunda GA4 doğrudan yüklenmez (çift sayfa görüntüleme önlenir); GA4’ü konteyner yönetir.</small>
          </div>
        </div>
        {ig.analyticsMode === 'direct' && ig.ga4Id && ig.gtmId && ig.gtmEnabled && (
          <p role="note" style={{ marginTop:'var(--s-3)', padding:'.6rem .8rem', borderRadius:'8px', background:'#FEF3F2', color:'#B42318', border:'1px solid #FDA29B', fontSize:'.85rem' }}>
            Uyarı: “Doğrudan GA4” modunda hem GA4 hem GTM etkin görünüyor. GA4’ü GTM üzerinden yönetiyorsanız çift ölçümü önlemek için “GTM ile yönetilen” modunu seçin veya GA4’ü kapatın.
          </p>
        )}
        <div style={{ marginTop:'var(--s-4)', display:'flex', gap:'.8rem', alignItems:'center' }}>
          <button className="adm-btn adm-btn--primary" onClick={save} disabled={saving}>{saving ? 'Kaydediliyor…' : 'Kaydet'}</button>
          {msg && <span className="muted">{msg}</span>}
        </div>
      </div>

      <div className="adm-panel">
        <strong>Servis durumu</strong>
        <p className="muted" style={{ fontSize:'.82rem', marginTop:'.25rem' }}>
          Yalnızca yapılandırma durumu gösterilir (gizli değerler asla gösterilmez). “Yapılandırıldı”, canlı raporlama anlamına gelmez.
        </p>
        <table className="adm-table" style={{ marginTop:'var(--s-3)' }}>
          <tbody>
            <tr><td>Supabase</td><td><Dot ok={status.supabase} /></td></tr>
            <tr><td>Shopify Storefront</td><td><Dot ok={status.shopifyStorefront} /></td></tr>
            <tr><td>Shopify Admin API</td><td><Dot ok={status.shopifyAdmin} /></td></tr>
            <tr><td>Shopify Webhook secret</td><td><Dot ok={status.shopifyWebhook} /></td></tr>
            <tr><td>Shopify alan adı</td><td>{status.shopifyDomain || <span className="muted">—</span>}</td></tr>
          </tbody>
        </table>
        <p className="muted" style={{ fontSize:'.82rem', marginTop:'var(--s-3)' }}>
          Gerekli Shopify kapsamları: <b>write_draft_orders</b> ve <b>read_orders</b>. Webhook’lar: <b>orders/paid</b>, <b>orders/cancelled</b> → <code>/api/shopify/orders</code>.
        </p>
      </div>
    </div>
  );
}
