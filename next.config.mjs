/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  images: {
    formats: ['image/avif', 'image/webp'],
  },
  // Storefront is static-first; admin routes are dynamic and never ship to the public bundle.
};
export default nextConfig;
