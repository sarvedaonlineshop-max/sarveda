import { NextResponse } from "next/server";

/**
 * Browser hits this Next route (wins over rewrites). Forwards to Express
 * `/api/newsletter/subscribe`. If staging API is not yet deployed (404),
 * falls back to `/api/contact/newsletter` then `/api/contact/support`
 * so signups are not lost.
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

    const fallback = await fetch(`${base}/api/contact/support`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({
        name: "Newsletter",
        email,
        subject: "Newsletter — Join the Community",
        subjectCategory: "OTHER",
        message: `Homepage newsletter signup (Join the Community).\nEmail: ${email}\nSource: ${source}`
      }),
      cache: "no-store"
    });

    const fallbackJson = (await fallback.json().catch(() => null)) as {
      success?: boolean;
      error?: string;
    } | null;

    if (!fallback.ok || !fallbackJson?.success) {
      return NextResponse.json(
        {
          success: false,
          error: fallbackJson?.error || "Could not join right now. Please try again.",
          code: "SUBSCRIBE_FAILED"
        },
        { status: fallback.status >= 400 ? fallback.status : 502 }
      );
    }

    return NextResponse.json({
      success: true,
      data: {
        created: true,
        alreadySubscribed: false,
        message: "Welcome to the Sarveda community."
      }
    });
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
