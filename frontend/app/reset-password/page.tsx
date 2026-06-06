"use client";

import Link from "next/link";
import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import { PasswordInput } from "@/components/auth/PasswordInput";
import { parseApiResponse } from "@/lib/parse-api-response";

function ResetForm() {
  const params = useSearchParams();
  const router = useRouter();
  const token = params.get("token") ?? "";
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (password !== confirm) {
      setError("Passwords do not match");
      return;
    }
    if (password.length < 8) {
      setError("Password must be at least 8 characters");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password })
      });
      const data = await parseApiResponse<{ message?: string }>(res);
      if (!data.success) throw new Error(data.error);
      setDone(true);
      setTimeout(() => router.push("/login"), 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Reset failed");
    } finally {
      setLoading(false);
    }
  }

  if (!token) {
    return (
      <div className="space-y-4 text-center">
        <p className="text-sm text-red-600">Invalid reset link.</p>
        <Link href="/forgot-password" className="text-sm" style={{ color: "var(--brand-gold)" }}>
          Request a new link
        </Link>
      </div>
    );
  }

  if (done) {
    return (
      <div className="text-center">
        <div className="mb-3 text-4xl">✅</div>
        <p className="font-semibold" style={{ color: "var(--brand-forest)" }}>
          Password reset! Redirecting to login...
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <h1 className="font-serif mb-2 text-2xl font-bold" style={{ color: "var(--brand-forest)" }}>
        Set new password
      </h1>
      <PasswordInput
        id="new-password"
        required
        value={password}
        onChange={setPassword}
        placeholder="New password (min 8 chars)"
        autoComplete="new-password"
        className="w-full rounded-lg border border-[var(--brand-cream-dark)] px-4 py-3 text-sm outline-none focus:border-[var(--brand-gold)]"
      />
      <PasswordInput
        id="confirm-password"
        required
        value={confirm}
        onChange={setConfirm}
        placeholder="Confirm new password"
        autoComplete="new-password"
        className="w-full rounded-lg border border-[var(--brand-cream-dark)] px-4 py-3 text-sm outline-none focus:border-[var(--brand-gold)]"
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
        {loading ? "Resetting..." : "Reset password"}
      </button>
    </form>
  );
}

export default function ResetPasswordPage() {
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
        <Suspense fallback={<p className="text-sm">Loading...</p>}>
          <ResetForm />
        </Suspense>
      </div>
    </div>
  );
}
