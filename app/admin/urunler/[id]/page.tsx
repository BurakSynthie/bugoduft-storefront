import { notFound } from 'next/navigation';
import { getProductById } from '@/repositories/catalog';
import { products } from '@/data/seed/products';
import Editor from './Editor';
export function generateStaticParams() { return products.map(p => ({ id: p.id })); }
export const metadata = { title: 'Ürün düzenle · BUGO DUFT' };
export default function AdminProductEditor({ params }: { params: { id: string } }) {
  const product = getProductById(params.id);
  if (!product) notFound();
  return <Editor product={product} />;
}
