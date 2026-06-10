"use client";

import Link from "next/link";
import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";

import { parseApiResponse } from "@/lib/parse-api-response";

function ForgotPasswordForm() {
  const searchParams = useSearchParams();
  const [email, setEmail] = useState(() => searchParams.get("email")?.trim().toLowerCase() ?? "");
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email })
      });
      if (res.status === 404) {
        setError(
          "No account found with this email. " +
            "Please check your email or register a new account."
        );
        return;
      }
      const data = await parseApiResponse<{ message?: string }>(res);
      if (!data.success) throw new Error(data.error);
      setSent(true);
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  if (sent) {
    return (
      <div
        className="flex min-h-screen items-center justify-center px-4"
        style={{ background: "var(--brand-cream)" }}
      >
        <div
          className="shadow-card w-full max-w-md rounded-xl border p-8 text-center"
          style={{
            background: "var(--brand-ivory)",
            borderColor: "var(--brand-cream-dark)"
          }}
        >
          <div className="mb-4 text-4xl">📧</div>
          <h1
            className="font-serif mb-3 text-2xl font-bold"
            style={{ color: "var(--brand-forest)" }}
          >
            Check your email
          </h1>
          <p className="text-sm" style={{ color: "var(--brand-muted)" }}>
            We sent a reset link to <strong>{email}</strong>. Check your inbox and spam folder. The
            link expires in 30 minutes.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div
      className="flex min-h-screen items-center justify-center px-4"
      style={{ background: "var(--brand-cream)" }}
    >
      <div
        className="shadow-card w-full max-w-md rounded-xl border p-8"
        style={{
          background: "var(--brand-ivory)",
          borderColor: "var(--brand-cream-dark)"
        }}
      >
        <h1
          className="font-serif mb-2 text-2xl font-bold"
          style={{ color: "var(--brand-forest)" }}
        >
          Forgot password?
        </h1>
        <p className="mb-6 text-sm" style={{ color: "var(--brand-muted)" }}>
          Enter your email and we will send you a reset link.
        </p>
        <form onSubmit={handleSubmit} className="space-y-4">
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="your@email.com"
            className="w-full rounded-lg border px-4 py-3 text-sm outline-none focus:border-[var(--brand-gold)]"
            style={{ borderColor: "var(--brand-cream-dark)" }}
          />
          {error ? <p className="text-sm text-red-600">{error}</p> : null}
          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-lg py-3 text-sm font-semibold disabled:opacity-50"
            style={{
              background: "var(--brand-forest)",
              color: "var(--brand-ivory)"
            }}
          >
            {loading ? "Sending..." : "Send reset link"}
          </button>
        </form>
        <p className="mt-4 text-center text-sm" style={{ color: "var(--brand-muted)" }}>
          Remember it?{" "}
          <Link href="/login" className="ml-1" style={{ color: "var(--brand-gold)" }}>
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}

export default function ForgotPasswordPage() {
  return (
    <Suspense
      fallback={
        <div
          className="flex min-h-screen items-center justify-center px-4 text-sm"
          style={{ background: "var(--brand-cream)", color: "var(--brand-muted)" }}
        >
          Loading…
        </div>
      }
    >
      <ForgotPasswordForm />
    </Suspense>
  );
}
