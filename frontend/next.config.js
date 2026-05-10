/** @type {import('next').NextConfig} */
const backendBase =
  process.env.BACKEND_PROXY_URL ||
  process.env.NEXT_PUBLIC_API_URL ||
  "http://127.0.0.1:5000";

const nextConfig = {
  reactStrictMode: true,
  /**
   * Proxy API to Express so auth cookies are set on the **Next.js origin** (e.g. :3000).
   * Without this, Set-Cookie from :5000 often never reaches page navigations on :3000.
   */
  async rewrites() {
    const dest = String(backendBase).replace(/\/$/, "");
    return [
      {
        source: "/api/:path*",
        destination: `${dest}/api/:path*`
      }
    ];
  }
};

module.exports = nextConfig;
