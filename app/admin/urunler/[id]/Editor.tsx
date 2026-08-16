'use client';
import { useState } from 'react';
import type { ProductSeed } from '@/data/types';
import MoneyInput from '@/components/admin/MoneyInput';

type L = 'de' | 'en' | 'fr';
const tabs: { id: L; label: string }[] = [
  { id:'de', label:'Almanca (kaynak)' }, { id:'en', label:'İngilizce' }, { id:'fr', label:'Fransızca' },
];
const F = (label: string, value: string, area = false) => ({ label, value, area });

export default function Editor({ product }: { product: ProductSeed }) {
  const [tab, setTab] = useState<L>('de');
  const [translateMsg, setTranslateMsg] = useState<string | null>(null);
  // Draft holds integer cents (converted from EUR inputs). Storage stays in cents.
  const [, setForm] = useState<{ basePriceCents: number | null; tiers: { unitPriceCents: number | null }[]; options: { priceDeltaCents: number | null }[] }>({
    basePriceCents: product.basePriceCents,
    tiers: product.tiers.map(t => ({ unitPriceCents: t.unitPriceCents })),
    options: product.options.map(o => ({ priceDeltaCents: o.priceDeltaCents })),
  });
  const t = product.tr[tab];

  return (
    <>
      <div className="adm__top">
        <div><h1>{product.tr.de.name}</h1>
          <div className="adm__crumb">Katalog / Ürünler / {product.productCode}</div></div>
        <div style={{ display:'flex', gap:'.5rem' }}>
          <button className="adm-btn adm-btn--ghost"
            onClick={() => setTranslateMsg('Çeviri servisi yapılandırılmadı. Diğer dillere otomatik çeviri, çeviri sağlayıcısı bağlandığında etkinleşecektir.')}>
            DİĞER DİLLERE OTOMATİK ÇEVİR
          </button>
          <button className="adm-btn adm-btn--primary"
            onClick={() => setTranslateMsg('Kaydetme, veritabanı (Supabase) bağlandığında etkinleşir. Şu an değişiklikler kalıcı değildir.')}>
            Kaydet
          </button>
        </div>
      </div>

      {translateMsg && <div className="adm-note" style={{ marginBottom:'var(--s-5)' }}><span>ⓘ</span><span>{translateMsg}</span></div>}

      {/* Base attributes — language-independent */}
      <div className="adm-panel">
        <strong>Temel bilgiler (dilden bağımsız)</strong>
        <div className="adm-grid2" style={{ marginTop:'var(--s-4)' }}>
          <div className="field"><label>Ürün kodu</label><input className="input" defaultValue={product.productCode} /></div>
          <div className="field"><label>Koleksiyon</label><input className="input" defaultValue={product.collectionCode} /></div>
          <div className="field"><label htmlFor="base-price">Başlangıç fiyatı</label>
            <MoneyInput id="base-price" cents={product.basePriceCents} onCents={c => setForm(f => ({ ...f, basePriceCents: c }))} /></div>
          <div className="field"><label>Para birimi</label><input className="input" defaultValue={product.currency} readOnly /></div>
        </div>
        <div className="adm-grid2">
          <div className="field"><label>Min. adet</label><input className="input" defaultValue={product.minQty} inputMode="numeric" /></div>
          <div className="field"><label>Adım (artış)</label><input className="input" defaultValue={product.qtyStep} inputMode="numeric" /></div>
          <div className="field"><label>Max. adet</label><input className="input" defaultValue={product.maxQty} inputMode="numeric" /></div>
        </div>
      </div>

      {/* Volume tiers — EUR editing, stored as cents */}
      <div className="adm-panel">
        <strong>Staffelpreise (kademeli fiyatlar)</strong>
        <table className="adm-table" style={{ marginTop:'var(--s-4)' }}>
          <thead><tr><th>Min. adet</th><th>Birim fiyat</th></tr></thead>
          <tbody>
            {product.tiers.map((tier, i) => (
              <tr key={tier.minQty}>
                <td style={{ width:'40%' }}><input className="input" defaultValue={tier.minQty} inputMode="numeric" /></td>
                <td><MoneyInput cents={tier.unitPriceCents}
                  onCents={c => setForm(f => { const tiers=[...f.tiers]; tiers[i]={...tiers[i], unitPriceCents:c}; return {...f, tiers}; })} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Option price adjustments — EUR editing, stored as cents */}
      <div className="adm-panel">
        <strong>Seçenek fiyat farkları</strong>
        <table className="adm-table" style={{ marginTop:'var(--s-4)' }}>
          <thead><tr><th>Seçenek</th><th>Fiyat farkı</th></tr></thead>
          <tbody>
            {product.options.map((o, i) => (
              <tr key={o.key}>
                <td style={{ width:'55%' }}>{o.labelDe}</td>
                <td><MoneyInput cents={o.priceDeltaCents}
                  onCents={c => setForm(f => { const options=[...f.options]; options[i]={...options[i], priceDeltaCents:c}; return {...f, options}; })} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Per-language translation rows (separate rows, independent slug + SEO) */}
      <div className="adm-panel">
        <div className="adm-tabs" role="tablist">
          {tabs.map(tb => (
            <button key={tb.id} role="tab" aria-selected={tab===tb.id} className="adm-tab" onClick={() => setTab(tb.id)}>
              {tb.label}
            </button>
          ))}
        </div>

        <div role="tabpanel">
          <div className="adm-grid2">
            <div className="field"><label>Ürün adı ({tab.toUpperCase()})</label><input className="input" key={tab+'n'} defaultValue={t.name} /></div>
            <div className="field"><label>URL slug ({tab.toUpperCase()})</label><input className="input" key={tab+'s'} defaultValue={t.slug} /></div>
          </div>
          <div className="field"><label>H1</label><input className="input" key={tab+'h'} defaultValue={t.h1} /></div>
          <div className="field"><label>Kısa açıklama</label><textarea className="textarea" rows={2} key={tab+'sd'} defaultValue={t.shortDesc} /></div>
          <div className="field"><label>Uzun açıklama</label><textarea className="textarea" rows={4} key={tab+'ld'} defaultValue={t.longDesc} /></div>

          <div style={{ borderTop:'1px solid var(--border)', margin:'var(--s-4) 0', paddingTop:'var(--s-4)' }}>
            <strong style={{ fontSize:'.9rem' }}>SEO ({tab.toUpperCase()})</strong>
          </div>
          <div className="field"><label>SEO başlığı</label><input className="input" key={tab+'st'} defaultValue={t.seo.title} /></div>
          <div className="field"><label>SEO açıklaması</label><textarea className="textarea" rows={2} key={tab+'sds'} defaultValue={t.seo.description} /></div>
          <p className="muted" style={{ fontSize:'.82rem' }}>
            Bu alanlar her dil için ayrı satır olarak saklanır. Canonical, hreflang ve site haritası bu slug’lardan üretilir.
          </p>
        </div>
      </div>
    </>
  );
}
