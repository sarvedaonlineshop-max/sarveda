import { jwtVerify } from "jose";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

const ADMIN_ROLES = new Set(["ADMIN", "SUPER_ADMIN"]);

function readRole(payload: unknown): string | undefined {
  if (!payload || typeof payload !== "object") return undefined;
  const r = (payload as { role?: unknown }).role;
  return typeof r === "string" ? r : undefined;
}

function isJwtAdminRole(role: string | undefined): boolean {
  if (!role) return false;
  return ADMIN_ROLES.has(role.trim().toUpperCase());
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const token = request.cookies.get("sarveda_auth")?.value;
  const secret = process.env.JWT_SECRET;

  if (pathname.startsWith("/admin")) {
    if (!token) {
      const login = new URL("/login", request.url);
      login.searchParams.set("next", pathname);
      return NextResponse.redirect(login);
    }

    if (!secret || secret.length < 32) {
      return NextResponse.redirect(new URL("/", request.url));
    }

    try {
      const { payload } = await jwtVerify(token, new TextEncoder().encode(secret));
      const role = readRole(payload);
      if (!role) {
        const login = new URL("/login", request.url);
        login.searchParams.set("next", pathname);
        login.searchParams.set("reason", "reauth");
        return NextResponse.redirect(login);
      }
      if (!isJwtAdminRole(role)) {
        return NextResponse.redirect(new URL("/", request.url));
      }
    } catch {
      const login = new URL("/login", request.url);
      login.searchParams.set("next", pathname);
      return NextResponse.redirect(login);
    }

    return NextResponse.next();
  }

  if (pathname === "/my-account" || pathname.startsWith("/my-account/")) {
    if (!token || !secret || secret.length < 32) {
      return NextResponse.next();
    }
    try {
      const { payload } = await jwtVerify(token, new TextEncoder().encode(secret));
      const role = readRole(payload);
      if (isJwtAdminRole(role)) {
        return NextResponse.redirect(new URL("/admin", request.url));
      }
    } catch {
      return NextResponse.next();
    }
    return NextResponse.next();
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/admin", "/admin/:path*", "/my-account", "/my-account/:path*"]
};
