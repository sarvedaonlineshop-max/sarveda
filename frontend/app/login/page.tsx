"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";

import { isAdminRole, loginWithPassword, logoutSession } from "@/lib/auth-client";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = searchParams.get("next") ?? "/admin";
  const err = searchParams.get("error");
  const reason = searchParams.get("reason");

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState(() => {
    if (err) return `Sign-in error: ${err}`;
    if (reason === "reauth") return "Please sign in again — your session needs to be refreshed for admin access.";
    return "";
  });

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setMessage("");
    try {
      const user = await loginWithPassword(email, password);
      if (!isAdminRole(user.role)) {
        await logoutSession();
        setMessage("This account does not have admin access. Use an ADMIN or SUPER_ADMIN user.");
        return;
      }
      router.replace(next.startsWith("/") ? next : "/admin");
      router.refresh();
    } catch (ex) {
      setMessage(ex instanceof Error ? ex.message : "Login failed");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-screen flex-col bg-stone-900 px-4 py-16">
      <div className="mx-auto w-full max-w-md rounded-2xl border border-stone-700 bg-stone-800 p-8 shadow-xl">
        <h1 className="font-serif text-2xl italic text-amber-400">Admin sign-in</h1>
        <p className="mt-2 text-sm text-stone-400">Use your Sarveda account with admin access.</p>

        <form className="mt-8 space-y-4" onSubmit={handleSubmit}>
          <div>
            <label htmlFor="email" className="sr-only">
              Email
            </label>
            <input
              id="email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Email"
              className="w-full rounded-lg border border-stone-600 bg-stone-900 px-3 py-2.5 text-stone-100 placeholder:text-stone-500 focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500"
            />
          </div>
          <div>
            <label htmlFor="password" className="sr-only">
              Password
            </label>
            <input
              id="password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Password"
              className="w-full rounded-lg border border-stone-600 bg-stone-900 px-3 py-2.5 text-stone-100 placeholder:text-stone-500 focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500"
            />
          </div>
          {message ? (
            <p className="text-sm text-red-400" role="alert">
              {message}
            </p>
          ) : null}
          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded-lg bg-amber-500 py-3 text-sm font-semibold text-stone-900 transition-colors hover:bg-amber-400 disabled:opacity-60"
          >
            {submitting ? "Signing in…" : "Sign in"}
          </button>
        </form>

        <div className="mt-6 space-y-3 text-center text-sm text-stone-500">
          <Link href="/" className="block text-amber-500 hover:text-amber-400">
            Back to storefront
          </Link>
          <button
            type="button"
            className="text-stone-400 underline decoration-stone-600 hover:text-amber-400"
            onClick={async () => {
              const { logoutSession } = await import("@/lib/auth-client");
              await logoutSession();
              setMessage("Signed out. You can sign in again with an admin account.");
            }}
          >
            Sign out (clear session cookie)
          </button>
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-stone-900 text-stone-400">
          Loading…
        </div>
      }
    >
      <LoginForm />
    </Suspense>
  );
}
