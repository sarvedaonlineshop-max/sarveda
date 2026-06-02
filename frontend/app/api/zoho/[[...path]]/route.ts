import { type NextRequest, NextResponse } from "next/server";

/**
 * Server-side proxy for /api/zoho/* → EC2 Express.
 * Route handlers take precedence over rewrites on Vercel and forward cookies/headers as-is.
 * Express applies requireAdmin only on specific Zoho routes (e.g. POST /sync/stock).
 */
function backendBase(): string {
  return (
    process.env.BACKEND_PROXY_URL ||
    (process.env.VERCEL ? "http://13.206.192.106:5000" : "http://127.0.0.1:5000")
  ).replace(/\/$/, "");
}

async function proxyToBackend(req: NextRequest, pathSegments: string[]): Promise<NextResponse> {
  const subpath = pathSegments.length > 0 ? `/${pathSegments.join("/")}` : "";
  const target = `${backendBase()}/api/zoho${subpath}${req.nextUrl.search}`;

  const headers = new Headers();
  req.headers.forEach((value, key) => {
    const lower = key.toLowerCase();
    if (lower === "host" || lower === "connection") return;
    headers.set(key, value);
  });

  const init: RequestInit = {
    method: req.method,
    headers,
    redirect: "manual",
    cache: "no-store"
  };

  if (req.method !== "GET" && req.method !== "HEAD") {
    init.body = await req.arrayBuffer();
  }

  const upstream = await fetch(target, init);
  const responseHeaders = new Headers(upstream.headers);
  responseHeaders.delete("transfer-encoding");

  return new NextResponse(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers: responseHeaders
  });
}

type RouteContext = { params: { path?: string[] } };

export async function GET(req: NextRequest, ctx: RouteContext) {
  return proxyToBackend(req, ctx.params.path ?? []);
}

export async function POST(req: NextRequest, ctx: RouteContext) {
  return proxyToBackend(req, ctx.params.path ?? []);
}

export async function PUT(req: NextRequest, ctx: RouteContext) {
  return proxyToBackend(req, ctx.params.path ?? []);
}

export async function PATCH(req: NextRequest, ctx: RouteContext) {
  return proxyToBackend(req, ctx.params.path ?? []);
}

export async function DELETE(req: NextRequest, ctx: RouteContext) {
  return proxyToBackend(req, ctx.params.path ?? []);
}
