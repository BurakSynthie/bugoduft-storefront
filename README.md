# BUGO DUFT — Storefront (Phase 2 + public Phase 3)

Custom B2B storefront for BUGO DUFT promotional air fresheners (Duftanhänger).
Next.js App Router + TypeScript. Real localized routing (`/de` `/en` `/fr`), international SEO
engine, data-driven content layer, Turkish admin foundation. Integrations are honestly unconfigured.

## Run
```bash
npm install
npm run dev          # http://localhost:3000  -> redirects to /de
```
Build: `npm run build && npm start`.

## Routes
- `/de` `/en` `/fr` — localized homepages (German is the source language)
- `/de/produkte` · `/en/products` · `/fr/produits` — product listing
- `/de/produkte/standard-duftanhaenger` (+ premium/deluxe/vip) — product page shell
  - EN: `/en/products/custom-air-freshener-standard` · FR: `/fr/produits/desodorisant-personnalise-standard`
- `/de/duefte` · `/de/branchen` (+ `/branchen/autohaeuser`) — scents / industries
- `/sitemap.xml`, `/robots.txt`
- `/admin` — Turkish admin (dashboard, `/admin/urunler`, `/admin/urunler/[id]`)

## Content / data layer
Content lives in `data/seed/*` as per-locale translation rows (name, slug, SEO per language) and is
read through `repositories/catalog.ts`. That repository is the seam: swap the seed for Supabase
queries in Phase 3 without touching pages or components.

## What is intentionally NOT faked
Payment (Shopier), email, invoice, shipping, translation and analytics are shown as
"Yapılandırılmadı / not configured". The quote form does not pretend to send. The admin shows no
invented metrics. No fake reviews, brands or logos.
