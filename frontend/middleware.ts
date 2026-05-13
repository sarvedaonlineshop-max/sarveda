import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

const ADMIN_ROLES = new Set(["ADMIN", "SUPER_ADMIN"]);

function isAdminRoleString(role: string | undefined | null): boolean {
  if (!role || typeof role !== "string") return false;
  return ADMIN_ROLES.has(role.trim().toUpperCase());
}

/**
 * Authoritative session + role from Express (Prisma), not the JWT payload on the edge.
 * Avoids: stale `role` in the cookie after a DB UPDATE, and JWT_SECRET drift between Vercel and EC2.
 */
async function fetchSessionRole(request: NextRequest): Promise<string | null> {
  try {
    const res = await fetch(new URL("/api/auth/me", request.url), {
      headers: {
        cookie: request.headers.get("cookie") ?? "",
        accept: "application/json"
      },
      cache: "no-store"
    });
    if (!res.ok) return null;
    const json = (await res.json()) as {
      success?: boolean;
      data?: { user?: { role?: string } };
    };
    if (!json.success) return null;
    const role = json.data?.user?.role;
    return typeof role === "string" ? role : null;
  } catch {
    return null;
  }
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (pathname.startsWith("/admin")) {
    const token = request.cookies.get("sarveda_auth")?.value;
    if (!token) {
      const login = new URL("/login", request.url);
      login.searchParams.set("next", pathname);
      return NextResponse.redirect(login);
    }

    const role = await fetchSessionRole(request);
    if (!role) {
      const login = new URL("/login", request.url);
      login.searchParams.set("next", pathname);
      login.searchParams.set("reason", "reauth");
      return NextResponse.redirect(login);
    }
    if (!isAdminRoleString(role)) {
      return NextResponse.redirect(new URL("/", request.url));
    }
    return NextResponse.next();
  }

  if (pathname === "/my-account" || pathname.startsWith("/my-account/")) {
    const role = await fetchSessionRole(request);
    if (role && isAdminRoleString(role)) {
      return NextResponse.redirect(new URL("/admin", request.url));
    }
    return NextResponse.next();
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/admin", "/admin/:path*", "/my-account", "/my-account/:path*"]
};
