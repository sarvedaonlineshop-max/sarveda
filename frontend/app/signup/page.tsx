"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useMemo, useState } from "react";

import { AuthShell } from "@/components/auth/AuthShell";
import { GoogleSignInButton } from "@/components/auth/GoogleSignInButton";
import {
  loginWithPassword,
  registerAccount,
  resolvePostLoginPath
} from "@/lib/auth-client";

const inputClass =
  "w-full rounded-xl border border-[rgba(196,176,232,0.35)] bg-brand-violet-deep/70 px-3 py-2.5 text-brand-lavender placeholder:text-brand-muted focus:border-brand-lavender-mid focus:outline-none focus:ring-1 focus:ring-brand-lavender-mid";

function SignupForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = searchParams.get("next");
  const googleNextPath = next ?? "/my-account";

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
        <p className="text-center text-sm text-brand-muted">
          Already have an account?{" "}
          <Link href={loginHref} className="text-brand-gold hover:text-brand-gold-bright">
            Sign in
          </Link>
        </p>
      }
    >
      <GoogleSignInButton nextPath={googleNextPath} label="Sign up with Google" />

      <div className="my-6 flex items-center gap-3 text-xs uppercase tracking-[0.2em] text-brand-muted">
        <span className="h-px flex-1 bg-brand-lavender-mid/30" />
        <span>or email</span>
        <span className="h-px flex-1 bg-brand-lavender-mid/30" />
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
          <input
            id="password"
            type="password"
            autoComplete="new-password"
            required
            minLength={8}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
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
          className="btn-primary w-full rounded-xl py-3 text-sm font-semibold disabled:opacity-60"
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
        <div className="flex min-h-screen items-center justify-center bg-brand-violet-deep text-brand-muted">
          Loading…
        </div>
      }
    >
      <SignupForm />
    </Suspense>
  );
}
