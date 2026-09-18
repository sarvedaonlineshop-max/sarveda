import { NextResponse } from "next/server";

/**
 * Browser hits this Next route (wins over rewrites). Forwards to Express
 * `/api/newsletter/subscribe`, then `/api/contact/newsletter` if needed.
 * Never falls back to support/enquiry create (that flooded Admin Chats).
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function backendBase(): string {
  const raw =
    process.env.BACKEND_PROXY_URL?.trim() ||
    process.env.INTERNAL_API_URL?.trim() ||
    (process.env.VERCEL ? "http://13.204.112.165" : "http://127.0.0.1:5000");
  return raw.replace(/\/$/, "");
}

export async function POST(req: Request) {
  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return NextResponse.json(
      { success: false, error: "Invalid JSON body", code: "VALIDATION_ERROR" },
      { status: 400 }
    );
  }

  const emailRaw =
    json && typeof json === "object" && "email" in json
      ? String((json as { email?: unknown }).email ?? "")
      : "";
  const sourceRaw =
    json && typeof json === "object" && "source" in json
      ? String((json as { source?: unknown }).source ?? "")
      : "";

  const email = emailRaw.trim().toLowerCase();
  const source = (sourceRaw.trim() || "homepage").slice(0, 60);

  if (!email || email.length > 200 || !EMAIL_RE.test(email)) {
    return NextResponse.json(
      { success: false, error: "Enter a valid email address.", code: "VALIDATION_ERROR" },
      { status: 400 }
    );
  }

  const base = backendBase();

  try {
    const primary = await fetch(`${base}/api/newsletter/subscribe`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ email, source }),
      cache: "no-store"
    });

    if (primary.status !== 404) {
      const payload = await primary.json().catch(() => ({
        success: false,
        error: "Unexpected response from server."
      }));
      return NextResponse.json(payload, { status: primary.status });
    }

    const viaContact = await fetch(`${base}/api/contact/newsletter`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ email, source }),
      cache: "no-store"
    });

    if (viaContact.status !== 404) {
      const payload = await viaContact.json().catch(() => ({
        success: false,
        error: "Unexpected response from server."
      }));
      return NextResponse.json(payload, { status: viaContact.status });
    }

    return NextResponse.json(
      {
        success: false,
        error: "Newsletter signup is temporarily unavailable. Please try again later.",
        code: "SUBSCRIBE_UNAVAILABLE"
      },
      { status: 503 }
    );
  } catch {
    return NextResponse.json(
      {
        success: false,
        error: "Could not reach the server. Please try again in a moment.",
        code: "NETWORK_ERROR"
      },
      { status: 503 }
    );
  }
}
