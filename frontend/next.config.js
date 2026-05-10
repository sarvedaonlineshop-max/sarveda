/** @type {import('next').NextConfig} */
// On Vercel, proxy /api → EC2 Express. Locally, default to localhost unless BACKEND_PROXY_URL is set.
const backendBase =
  process.env.BACKEND_PROXY_URL ||
  (process.env.VERCEL ? "http://13.206.192.106:5000" : "http://127.0.0.1:5000");

const nextConfig = {
  reactStrictMode: true,
  async rewrites() {
    const dest = String(backendBase).replace(/\/$/, "");
    return [
      {
        source: "/api/:path*",
        destination: `${dest}/api/:path*`,
      },
    ];
  },
  images: {
    domains: ["sarveda.com"],
  },
};

module.exports = nextConfig;
