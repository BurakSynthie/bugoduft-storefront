import 'server-only';

import crypto from 'node:crypto';

type PurchaseKind = 'main' | 'sample';

type ServerPurchaseInput = {
  order: any;
  shopifyOrderId: string;
  eventAt: string;
  kind: PurchaseKind;
};

type PurchaseItem = {
  item_id: string;
  item_name: string;
  price: number;
  quantity: number;
};

function attr(order: any, key: string): string | null {
  const list =
    order?.line_items?.flatMap((li: any) => li?.properties ?? []) ?? [];

  const found = list.find((p: any) => p?.name === key);
  const value = found?.value;

  if (value == null) return null;

  const cleaned = String(value).trim();
  return cleaned || null;
}

function money(value: unknown): number | null {
  const n = Number.parseFloat(String(value ?? ''));
  return Number.isFinite(n) && n >= 0 ? n : null;
}

function cleanText(value: unknown, max = 200): string | null {
  if (value == null) return null;
  const v = String(value).trim();
  return v ? v.slice(0, max) : null;
}

function sha256(value: string): string {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function normalizedEmail(order: any): string | null {
  const raw =
    order?.email ??
    order?.contact_email ??
    order?.customer?.email ??
    null;

  const value = cleanText(raw, 320);
  return value ? value.toLowerCase() : null;
}

function normalizedPhone(order: any): string | null {
  const raw =
    order?.phone ??
    order?.shipping_address?.phone ??
    order?.billing_address?.phone ??
    order?.customer?.phone ??
    null;

  if (!raw) return null;

  let digits = String(raw).replace(/\D/g, '');
  if (digits.startsWith('00')) digits = digits.slice(2);

  return digits || null;
}

function buildItems(
  order: any,
  kind: PurchaseKind,
  shopifyOrderId: string,
  fallbackValue: number,
): PurchaseItem[] {
  const rows = Array.isArray(order?.line_items) ? order.line_items : [];

  const items = rows
    .map((li: any, index: number) => {
      const quantityRaw = Number(li?.quantity);
      const quantity =
        Number.isFinite(quantityRaw) && quantityRaw > 0
          ? Math.floor(quantityRaw)
          : 1;

      const price =
        money(li?.price) ??
        money(li?.price_set?.shop_money?.amount) ??
        (rows.length === 1 ? fallbackValue / quantity : 0);

      const itemId =
        cleanText(li?.sku) ??
        cleanText(li?.variant_id) ??
        cleanText(li?.product_id) ??
        cleanText(li?.id) ??
        `${kind}-${shopifyOrderId}-${index + 1}`;

      const itemName =
        cleanText(li?.name) ??
        cleanText(li?.title) ??
        (kind === 'sample'
          ? 'BUGO Duftmuster-Set (40 Duefte)'
          : 'BUGO Custom Car Air Freshener');

      return {
        item_id: itemId,
        item_name: itemName,
        price: Number(price.toFixed(2)),
        quantity,
      };
    })
    .filter((item: PurchaseItem) => item.price >= 0);

  if (items.length) return items;

  return [
    {
      item_id: `${kind}-${shopifyOrderId}`,
      item_name:
        kind === 'sample'
          ? 'BUGO Duftmuster-Set (40 Duefte)'
          : 'BUGO Custom Car Air Freshener',
      price: Number(fallbackValue.toFixed(2)),
      quantity: 1,
    },
  ];
}

function eventSeconds(eventAt: string): number {
  const ms = Date.parse(eventAt);
  return Number.isFinite(ms)
    ? Math.floor(ms / 1000)
    : Math.floor(Date.now() / 1000);
}

function eventMicros(eventAt: string): string | undefined {
  const ms = Date.parse(eventAt);
  return Number.isFinite(ms) ? String(Math.floor(ms * 1000)) : undefined;
}

async function sendGa4(input: {
  order: any;
  shopifyOrderId: string;
  eventAt: string;
  currency: string;
  value: number;
  items: PurchaseItem[];
}) {
  if (attr(input.order, 'BUGO Analytics Consent') !== '1') return;

  const clientId = attr(input.order, 'BUGO GA Client ID');
  const measurementId = process.env.GA4_MEASUREMENT_ID?.trim();
  const apiSecret = process.env.GA4_API_SECRET?.trim();

  if (!clientId || !measurementId || !apiSecret) return;

  try {
    const timestampMicros = eventMicros(input.eventAt);

    const body: Record<string, unknown> = {
      client_id: clientId,
      events: [
        {
          name: 'purchase',
          params: {
            transaction_id: input.shopifyOrderId,
            currency: input.currency,
            value: input.value,
            affiliation: 'BUGO DUFT.DE',
            items: input.items,
          },
        },
      ],
    };

    if (timestampMicros) body.timestamp_micros = timestampMicros;

    const res = await fetch(
      `https://region1.google-analytics.com/mp/collect?measurement_id=${encodeURIComponent(measurementId)}&api_secret=${encodeURIComponent(apiSecret)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(5000),
      },
    );

    if (!res.ok) {
      console.error('[analytics] GA4 purchase failed:', res.status);
    }
  } catch (error) {
    console.error(
      '[analytics] GA4 purchase error:',
      error instanceof Error ? error.message : String(error),
    );
  }
}

async function sendMeta(input: {
  order: any;
  shopifyOrderId: string;
  eventAt: string;
  currency: string;
  value: number;
  items: PurchaseItem[];
}) {
  if (attr(input.order, 'BUGO Marketing Consent') !== '1') return;

  const pixelId = process.env.META_PIXEL_ID?.trim();
  const accessToken = process.env.META_CAPI_ACCESS_TOKEN?.trim();

  if (!pixelId || !accessToken) return;

  const email = normalizedEmail(input.order);
  const phone = normalizedPhone(input.order);
  const fbp = attr(input.order, 'BUGO Meta FBP');
  const fbc = attr(input.order, 'BUGO Meta FBC');

  const userData: Record<string, unknown> = {};

  if (email) userData.em = [sha256(email)];
  if (phone) userData.ph = [sha256(phone)];
  if (fbp) userData.fbp = fbp;
  if (fbc) userData.fbc = fbc;

  try {
    const res = await fetch(
      `https://graph.facebook.com/v26.0/${encodeURIComponent(pixelId)}/events`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          data: [
            {
              event_name: 'Purchase',
              event_time: eventSeconds(input.eventAt),
              event_id: `bugo-purchase-${input.shopifyOrderId}`,
              action_source: 'website',
              event_source_url: 'https://bugoduft.de/',
              user_data: userData,
              custom_data: {
                currency: input.currency,
                value: input.value,
                content_type: 'product',
                content_ids: input.items.map((item) => item.item_id),
                contents: input.items.map((item) => ({
                  id: item.item_id,
                  quantity: item.quantity,
                  item_price: item.price,
                })),
              },
            },
          ],
        }),
        signal: AbortSignal.timeout(5000),
      },
    );

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      console.error(
        '[analytics] Meta Purchase failed:',
        res.status,
        text.slice(0, 500),
      );
    }
  } catch (error) {
    console.error(
      '[analytics] Meta Purchase error:',
      error instanceof Error ? error.message : String(error),
    );
  }
}

export async function sendServerPurchase({
  order,
  shopifyOrderId,
  eventAt,
  kind,
}: ServerPurchaseInput): Promise<void> {
  try {
    const currency =
      cleanText(order?.currency, 3)?.toUpperCase() ?? 'EUR';

    const total =
      money(order?.total_price) ??
      money(order?.current_total_price) ??
      0;

    if (total <= 0) {
      console.error(
        '[analytics] Purchase skipped: invalid total',
        shopifyOrderId,
      );
      return;
    }

    const items = buildItems(order, kind, shopifyOrderId, total);

    await Promise.all([
      sendGa4({
        order,
        shopifyOrderId,
        eventAt,
        currency,
        value: Number(total.toFixed(2)),
        items,
      }),
      sendMeta({
        order,
        shopifyOrderId,
        eventAt,
        currency,
        value: Number(total.toFixed(2)),
        items,
      }),
    ]);
  } catch (error) {
    // Analytics is deliberately fail-open. A reporting outage must never
    // break payment fulfilment or force a valid Shopify webhook to fail.
    console.error(
      '[analytics] server Purchase error:',
      error instanceof Error ? error.message : String(error),
    );
  }
}
