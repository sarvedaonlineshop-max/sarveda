const withPWA = require("next-pwa")({
  dest: "public",
  register: true,
  skipWaiting: true,
  disable: process.env.NODE_ENV === "development" || process.env.DISABLE_PWA === "1",
});

/** @type {import('next').NextConfig} */
// On Vercel, proxy /api → EC2 Express. Locally, default to localhost unless BACKEND_PROXY_URL is set.
const backendBase =
  process.env.BACKEND_PROXY_URL ||
  process.env.INTERNAL_API_URL ||
  (process.env.VERCEL ? "http://13.206.192.106:5000" : "http://127.0.0.1:5000");

const nextConfig = {
  reactStrictMode: true,
  async rewrites() {
    const dest = String(backendBase).replace(/\/$/, "");
    return [
      // Zoho Books — explicit proxy to EC2 (auth handled per-route on Express).
      {
        source: "/api/zoho/:path*",
        destination: `${dest}/api/zoho/:path*`,
      },
      {
        source: "/api/:path*",
        destination: `${dest}/api/:path*`,
      },
    ];
  },
  async redirects() {
    return [
      // Trailing slash removal (WooCommerce uses trailing slashes)
      {
        source: "/product/:slug/",
        destination: "/product/:slug",
        permanent: true
      },
      {
        source: "/product-category/:slug/",
        destination: "/product-category/:slug",
        permanent: true
      },
      {
        source: "/shop/",
        destination: "/shop",
        permanent: true
      },
      // WooCommerce blog → new insights
      {
        source: "/blog/:slug",
        destination: "/:slug",
        permanent: true
      },
      // WP legacy paths
      {
        source: "/product-tag/:slug",
        destination: "/shop?tag=:slug",
        permanent: true
      },
      // Old WooCommerce my-account
      {
        source: "/my-account",
        destination: "/profile",
        permanent: true
      },
      {
        source: "/my-account/",
        destination: "/profile",
        permanent: true
      },
      // Old WooCommerce cart
      {
        source: "/woocommerce-cart",
        destination: "/cart",
        permanent: true
      },
      {
        source: "/privacy-policy",
        destination: "/privacy",
        permanent: true
      },
      {
        source: "/privacy-policy/",
        destination: "/privacy",
        permanent: true
      },
      {
        source: "/terms-conditions",
        destination: "/terms",
        permanent: true
      },
      {
        source: "/shipping-policy",
        destination: "/shipping",
        permanent: true
      },
      {
        source: "/refund-policy",
        destination: "/refunds",
        permanent: true
      }
    ];
  },
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "sarveda.com", pathname: "/**" },
      { protocol: "https", hostname: "sarveda-media.s3.amazonaws.com", pathname: "/**" },
      { protocol: "https", hostname: "sarveda-media.s3.us-east-1.amazonaws.com", pathname: "/**" },
      { protocol: "https", hostname: "*.cloudfront.net", pathname: "/**" }
    ],
    domains: ["sarveda.com", "sarveda-media.s3.amazonaws.com"],
  },
};

module.exports = withPWA(nextConfig);
