import { notFound } from 'next/navigation';
import { getProductById } from '@/repositories/catalog';
import { products } from '@/data/seed/products';
import { loadProduct, type EditableProduct, type ProductTr } from '@/repositories/admin-product';
import { isSupabaseConfigured } from '@/lib/supabase/env';
import { locales, type Locale } from '@/i18n/config';
import type { ProductSeed } from '@/data/types';
import Editor from './Editor';

export function generateStaticParams() { return products.map(p => ({ id: p.id })); }
export const metadata = { title: 'Ürün düzenle · BUGO DUFT' };
export const dynamic = 'force-dynamic';

// Seed → editable shape, used as fallback when the DB has no row yet / is unconfigured.
function fromSeed(p: ProductSeed): EditableProduct {
  const tr = {} as Record<Locale, ProductTr>;
  for (const l of locales) {
    const t = p.tr[l];
    tr[l] = { name:t.name, slug:t.slug, h1:t.h1, shortDesc:t.shortDesc, longDesc:t.longDesc,
      features:[], useCase:'', productionInfo:'', deliveryInfo:'', moqText:'', badge:'',
      seoTitle:t.seo.title, seoDescription:t.seo.description, promoBadge:'', coverAlt:'' };
  }
  return { id:p.id, productCode:p.productCode, collectionCode:p.collectionCode, currency:p.currency,
    basePriceCents:p.basePriceCents, minQty:p.minQty, qtyStep:p.qtyStep, maxQty:p.maxQty,
    isActive:p.isActive, sortOrder:0, compareAtCents:null, promoEnabled:false, promoStart:null, promoEnd:null,
    tiers: (p.tiers||[]).map(t=>({minQty:t.minQty,ratePer1000Cents:t.unitPriceCents,badgeDe:'',badgeEn:'',badgeFr:'',isActive:true})),
    cover:null, video:null, poster:null, gallery:[], tr };
}

export default async function AdminProductEditor({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;                      // §HIGH-16 Next.js 15 async params
  const seed = getProductById(id);
  if (!seed) notFound();
  const configured = isSupabaseConfigured();
  const initial = (configured ? await loadProduct(seed.productCode) : null) ?? fromSeed(seed);
  return <Editor initial={initial} configured={configured} />;
}
