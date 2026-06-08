"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useMemo, useState } from "react";

import { AuthShell } from "@/components/auth/AuthShell";
import { GoogleSignInButton } from "@/components/auth/GoogleSignInButton";
import { PasswordInput } from "@/components/auth/PasswordInput";
import {
  loginWithPassword,
  registerAccount,
  resolvePostLoginPath
} from "@/lib/auth-client";

const inputClass =
  "w-full rounded-xl border border-stone-600 bg-stone-950/70 px-3 py-2.5 text-stone-100 placeholder:text-stone-500 focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500";

function SignupForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = searchParams.get("next");
  const googleNextPath = next ?? "/";

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState("");

  const loginHref = useMemo(() => {
    const params = new URLSearchParams();
    if (next) params.set("next", next);
    const q = params.toString();
    return q ? `/login?${q}` : "/login";
  }, [next]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setMessage("");
    try {
      await registerAccount({ name, email, password });
      const user = await loginWithPassword(email, password);
      const destination = resolvePostLoginPath(user, next);
      router.replace(destination);
      router.refresh();
    } catch (ex) {
      setMessage(ex instanceof Error ? ex.message : "Sign up failed");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthShell
      title="Create your account"
      subtitle="Join Sarveda with email or Google. Password must be at least 8 characters."
      footer={
        <p className="text-center text-sm text-stone-400">
          Already have an account?{" "}
          <Link href={loginHref} className="text-amber-400 hover:text-amber-300">
            Sign in
          </Link>
        </p>
      }
    >
      <GoogleSignInButton nextPath={googleNextPath} label="Sign up with Google" />

      <div className="my-6 flex items-center gap-3 text-xs uppercase tracking-[0.2em] text-stone-500">
        <span className="h-px flex-1 bg-stone-700" />
        <span>or email</span>
        <span className="h-px flex-1 bg-stone-700" />
      </div>

      <form className="space-y-4" onSubmit={handleSubmit}>
        <div>
          <label htmlFor="name" className="sr-only">
            Full name
          </label>
          <input
            id="name"
            type="text"
            autoComplete="name"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Full name"
            className={inputClass}
          />
        </div>
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
            className={inputClass}
          />
        </div>
        <div>
          <label htmlFor="password" className="sr-only">
            Password
          </label>
          <PasswordInput
            id="password"
            autoComplete="new-password"
            required
            minLength={8}
            value={password}
            onChange={setPassword}
            placeholder="Password (8+ characters)"
            className={inputClass}
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
          className="w-full rounded-xl bg-amber-500 py-3 text-sm font-semibold text-stone-900 transition-colors hover:bg-amber-400 disabled:opacity-60"
        >
          {submitting ? "Creating account…" : "Create account"}
        </button>
      </form>
    </AuthShell>
  );
}

export default function SignupPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-stone-950 text-stone-400">
          Loading…
        </div>
      }
    >
      <SignupForm />
    </Suspense>
  );
}
