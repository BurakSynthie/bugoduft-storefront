// Client-safe constants for the paid Duftmuster-Set (fragrance sample) product.
// Deliberately NOT in repositories/samples.ts (which is 'server-only') so that client
// components (e.g. components/storefront/SamplePage.tsx) can import these plain numbers
// without pulling a server-only module into the client bundle.
export const SAMPLE_PRICE_CENTS = 4000;
export const SAMPLE_CREDIT_CENTS = 2000;
