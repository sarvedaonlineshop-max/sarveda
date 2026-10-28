import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const STAFF_ROLES = new Set(["ADMIN", "SUPER_ADMIN"]);
const SLUG_RE = /^[a-z0-9][a-z0-9-]{0,180}$/i;

const CONTENT_TYPES = new Set([
  "pages",
  "courses",
  "events",
  "blog",
  "vaidyas",
  "mentors",
  "retreats",
  "offers",
  "testimonials"
]);

function backendBase(): string {
  const raw =
    process.env.INTERNAL_API_URL?.trim() ||
    process.env.BACKEND_PROXY_URL?.trim() ||
    "http://127.0.0.1:5000";
  return raw.replace(/\/$/, "");
}

function pathsFor(type: string, slug: string | null): string[] {
  const paths = new Set<string>();
  if (type === "courses") {
    paths.add("/courses");
    paths.add("/");
    if (slug) paths.add(`/course/${slug}`);
  } else if (type === "events") {
    paths.add("/events");
    paths.add("/");
    if (slug) paths.add(`/event/${slug}`);
  } else if (type === "mentors") {
    paths.add("/mentors");
    if (slug) paths.add(`/mentor/${slug}`);
  } else if (type === "vaidyas") {
    paths.add("/vaidyas");
    if (slug) paths.add(`/vaidya/${slug}`);
  } else if (type === "retreats") {
    paths.add("/retreats");
    if (slug) paths.add(`/retreat/${slug}`);
  } else if (type === "offers") {
    paths.add("/offers");
    if (slug) paths.add(`/offers/${slug}`);
  } else if (type === "blog") {
    paths.add("/insights");
    paths.add("/");
    if (slug) paths.add(`/${slug}`);
  } else if (type === "pages" && slug) {
    paths.add(`/${slug}`);
  } else if (type === "testimonials") {
    paths.add("/");
  }
  return [...paths];
}

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { success: false, error: "Invalid JSON body", code: "VALIDATION_ERROR" },
      { status: 400 }
    );
  }

  const typeRaw =
    body && typeof body === "object" && "type" in body
      ? String((body as { type?: unknown }).type ?? "")
      : "";
  const slugRaw =
    body && typeof body === "object" && "slug" in body
      ? String((body as { slug?: unknown }).slug ?? "")
      : "";
  const type = typeRaw.trim();
  const slug = slugRaw.trim();

  if (!CONTENT_TYPES.has(type)) {
    return NextResponse.json(
      { success: false, error: "Unknown content type", code: "VALIDATION_ERROR" },
      { status: 400 }
    );
  }
  if (slug && !SLUG_RE.test(slug)) {
    return NextResponse.json(
      { success: false, error: "Invalid slug", code: "VALIDATION_ERROR" },
      { status: 400 }
    );
  }

  const cookie = req.headers.get("cookie") ?? "";
  if (!cookie) {
    return NextResponse.json(
      { success: false, error: "Not authenticated", code: "UNAUTHORIZED" },
      { status: 401 }
    );
  }

  let role = "";
  try {
    const me = await fetch(`${backendBase()}/api/auth/me`, {
      headers: { Accept: "application/json", Cookie: cookie },
      cache: "no-store"
    });
    if (!me.ok) {
      return NextResponse.json(
        { success: false, error: "Not authenticated", code: "UNAUTHORIZED" },
        { status: 401 }
      );
    }
    const json = (await me.json()) as {
      data?: { user?: { role?: string } };
    };
    role = String(json.data?.user?.role ?? "").trim().toUpperCase();
  } catch {
    return NextResponse.json(
      { success: false, error: "Auth check failed", code: "UNAUTHORIZED" },
      { status: 401 }
    );
  }

  if (!STAFF_ROLES.has(role)) {
    return NextResponse.json(
      { success: false, error: "Forbidden", code: "FORBIDDEN" },
      { status: 403 }
    );
  }

  const paths = pathsFor(type, slug || null);
  for (const path of paths) {
    revalidatePath(path);
  }

  return NextResponse.json({ success: true, data: { paths } });
}
