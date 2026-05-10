import { jwtVerify } from "jose";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

const ADMIN_ROLES = new Set(["ADMIN", "SUPER_ADMIN"]);

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (!pathname.startsWith("/admin")) {
    return NextResponse.next();
  }

  const token = request.cookies.get("sarveda_auth")?.value;
  if (!token) {
    const login = new URL("/login", request.url);
    login.searchParams.set("next", pathname);
    return NextResponse.redirect(login);
  }

  const secret = process.env.JWT_SECRET;
  if (!secret || secret.length < 32) {
    return NextResponse.redirect(new URL("/", request.url));
  }

  try {
    const { payload } = await jwtVerify(token, new TextEncoder().encode(secret));
    const role = typeof payload.role === "string" ? payload.role : undefined;
    // Legacy JWTs (issued before role was embedded) — force re-login to refresh cookie
    if (!role) {
      const login = new URL("/login", request.url);
      login.searchParams.set("next", pathname);
      login.searchParams.set("reason", "reauth");
      return NextResponse.redirect(login);
    }
    if (!ADMIN_ROLES.has(role)) {
      return NextResponse.redirect(new URL("/", request.url));
    }
  } catch {
    const login = new URL("/login", request.url);
    login.searchParams.set("next", pathname);
    return NextResponse.redirect(login);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/admin", "/admin/:path*"]
};
