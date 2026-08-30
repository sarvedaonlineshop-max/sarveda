const withPWA = require("next-pwa")({
  dest: "public",
  register: true,
  skipWaiting: true,
  disable: process.env.NODE_ENV === "development" || process.env.DISABLE_PWA === "1",
});

/** @type {import('next').NextConfig} */
// On Vercel, proxy /api → Lightsail Express (nginx :80). Override with BACKEND_PROXY_URL.
const backendBase =
  process.env.BACKEND_PROXY_URL ||
  process.env.INTERNAL_API_URL ||
  (process.env.VERCEL ? "http://13.204.112.165" : "http://127.0.0.1:5000");

const nextConfig = {
  reactStrictMode: true,
  async rewrites() {
    const dest = String(backendBase).replace(/\/$/, "");
    return [
      // Geo zone runs on Vercel edge (uses request.geo); must not proxy to the API host.
      // Next.js route handlers win over rewrites, but this documents intent.
      // Storefront alias: /store URL → shop page (SEO keeps /shop as internal route).
      {
        source: "/store",
        destination: "/shop",
      },
      {
        source: "/store/:path*",
        destination: "/shop/:path*",
      },
      // Zoho Books — explicit proxy to API host (auth handled per-route on Express).
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
        destination: "/store",
        permanent: true
      },
      {
        source: "/shop",
        destination: "/store",
        permanent: true
      },
      // Woo top-level All is the same catalog as /store.
      {
        source: "/product-category/all",
        destination: "/store",
        permanent: true
      },
      {
        source: "/product/shruthi-thali-gong-plates-etched",
        destination: "/product/gong-plates-shruti-plates-plain",
        permanent: true
      },
      // Old demo prefixed slugs → live Woo slugs (SEO + bookmarks)
      {
        source: "/product-category/yoga-meditation",
        destination: "/product-category/yoga-and-meditation",
        permanent: true
      },
      {
        source: "/product-category/sound-musical-instruments-accessories",
        destination: "/product-category/accessories",
        permanent: true
      },
      {
        source: "/product-category/sound-musical-instruments-all",
        destination: "/product-category/all-musical-instruments",
        permanent: true
      },
      {
        source: "/product-category/sound-musical-instruments-chimes",
        destination: "/product-category/chimes",
        permanent: true
      },
      {
        source: "/product-category/sound-musical-instruments-crystal-bowls",
        destination: "/product-category/crystal-bowls",
        permanent: true
      },
      {
        source: "/product-category/sound-musical-instruments-gongs",
        destination: "/product-category/gongs-musical-instruments",
        permanent: true
      },
      {
        source: "/product-category/sound-musical-instruments-handpans-tongue-drum",
        destination: "/product-category/handpans-tongue-drum",
        permanent: true
      },
      {
        source: "/product-category/sound-musical-instruments-indian-classical",
        destination: "/product-category/indian-classical",
        permanent: true
      },
      {
        source: "/product-category/sound-musical-instruments-kids",
        destination: "/product-category/kids",
        permanent: true
      },
      {
        source: "/product-category/sound-musical-instruments-percussion",
        destination: "/product-category/percussion",
        permanent: true
      },
      {
        source: "/product-category/sound-musical-instruments-rattles-shakers",
        destination: "/product-category/rattles-shakers",
        permanent: true
      },
      {
        source: "/product-category/sound-musical-instruments-singing-bowls-bells",
        destination: "/product-category/singing-bowls-bells",
        permanent: true
      },
      {
        source: "/product-category/sound-musical-instruments-tuning-forks",
        destination: "/product-category/tuning-forks",
        permanent: true
      },
      {
        source: "/product-category/sound-musical-instruments-wind",
        destination: "/product-category/wind",
        permanent: true
      },
      {
        source: "/product-category/sound-musical-instruments-xylophones",
        destination: "/product-category/xylophones",
        permanent: true
      },
      {
        source: "/product-category/eco-living-sustainable-all",
        destination: "/product-category/all-handpans-tonguedrum",
        permanent: true
      },
      {
        source: "/product-category/eco-living-sustainable-bottles",
        destination: "/product-category/bottles",
        permanent: true
      },
      {
        source: "/product-category/eco-living-sustainable-gift-sets",
        destination: "/product-category/gift-sets",
        permanent: true
      },
      {
        source: "/product-category/eco-living-sustainable-home-workspace",
        destination: "/product-category/home-workspace",
        permanent: true
      },
      {
        source: "/product-category/eco-living-sustainable-personal-care",
        destination: "/product-category/personal-care",
        permanent: true
      },
      {
        source: "/product-category/yoga-meditation-all",
        destination: "/product-category/all-yoga-and-meditation",
        permanent: true
      },
      {
        source: "/product-category/yoga-meditation-bottles-accessories",
        destination: "/product-category/bottles-accessories",
        permanent: true
      },
      {
        source: "/product-category/yoga-meditation-meditation-cushions-benches",
        destination: "/product-category/meditation-cushions-benches",
        permanent: true
      },
      {
        source: "/product-category/yoga-meditation-yoga-mats-props",
        destination: "/product-category/yoga-mats-props",
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
        source: "/terms-conditions/",
        destination: "/terms",
        permanent: true
      },
      {
        source: "/terms-of-use",
        destination: "/terms",
        permanent: true
      },
      {
        source: "/terms-of-use/",
        destination: "/terms",
        permanent: true
      },
      {
        source: "/shipping-policy",
        destination: "/shipping",
        permanent: true
      },
      {
        source: "/shipping-policy/",
        destination: "/shipping",
        permanent: true
      },
      {
        source: "/shipping-and-delivery-policy",
        destination: "/shipping",
        permanent: true
      },
      {
        source: "/shipping-and-delivery-policy/",
        destination: "/shipping",
        permanent: true
      },
      {
        source: "/refund-policy",
        destination: "/refunds",
        permanent: true
      },
      {
        source: "/refund-policy/",
        destination: "/refunds",
        permanent: true
      },
      {
        source: "/cancellation-and-returns",
        destination: "/refunds",
        permanent: true
      },
      {
        source: "/cancellation-and-returns/",
        destination: "/refunds",
        permanent: true
      },
      {
        source: "/product/sunshine-within-me-artistic-design",
        destination: "/product/copper-bottle-orange-light",
        permanent: true
      },
      {
        source: "/product/sunshine-within-me-artistic-design/",
        destination: "/product/copper-bottle-orange-light",
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
