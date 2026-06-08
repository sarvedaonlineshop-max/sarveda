"use client";

import { FormEvent, useState } from "react";

import type { PublicUser } from "@/lib/auth-client";
import { sendLoginOtp, verifyLoginOtp } from "@/lib/auth-client";

type OtpLoginFormProps = {
  inputClass: string;
  onSuccess: (user: PublicUser) => void;
};

type OtpStep = "email" | "code";

export function OtpLoginForm({ inputClass, onSuccess }: OtpLoginFormProps) {
  const [step, setStep] = useState<OtpStep>("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState("");
  const [info, setInfo] = useState("");

  async function handleSendOtp(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setMessage("");
    setInfo("");
    try {
      await sendLoginOtp(email);
      setStep("code");
      setCode("");
      setInfo(`We sent a 6-digit code to ${email.trim().toLowerCase()}. Check your inbox and spam folder.`);
    } catch (ex) {
      setMessage(ex instanceof Error ? ex.message : "Could not send OTP");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleVerifyOtp(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setMessage("");
    try {
      const user = await verifyLoginOtp(email, code);
      onSuccess(user);
    } catch (ex) {
      setMessage(ex instanceof Error ? ex.message : "Verification failed");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleResend() {
    setSubmitting(true);
    setMessage("");
    setInfo("");
    try {
      await sendLoginOtp(email);
      setInfo("A new code has been sent. The previous code no longer works.");
    } catch (ex) {
      setMessage(ex instanceof Error ? ex.message : "Could not resend OTP");
    } finally {
      setSubmitting(false);
    }
  }

  if (step === "code") {
    return (
      <form className="space-y-4" onSubmit={handleVerifyOtp}>
        {info ? (
          <p className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2.5 text-sm text-amber-100">
            {info}
          </p>
        ) : null}
        <div>
          <label htmlFor="otp-code" className="sr-only">
            Verification code
          </label>
          <input
            id="otp-code"
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="\d{6}"
            maxLength={6}
            required
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
            placeholder="6-digit code"
            className={`${inputClass} text-center text-lg tracking-[0.35em]`}
          />
        </div>
        {message ? (
          <p className="text-sm text-red-400" role="alert">
            {message}
          </p>
        ) : null}
        <button
          type="submit"
          disabled={submitting || code.length !== 6}
          className="w-full rounded-xl bg-amber-500 py-3 text-sm font-semibold text-stone-900 transition-colors hover:bg-amber-400 disabled:opacity-60"
        >
          {submitting ? "Verifying…" : "Verify & sign in"}
        </button>
        <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
          <button
            type="button"
            className="text-stone-400 hover:text-amber-400"
            onClick={() => {
              setStep("email");
              setCode("");
              setMessage("");
              setInfo("");
            }}
          >
            Change email
          </button>
          <button
            type="button"
            className="text-amber-400 hover:text-amber-300 disabled:opacity-60"
            disabled={submitting}
            onClick={() => void handleResend()}
          >
            Resend code
          </button>
        </div>
      </form>
    );
  }

  return (
    <form className="space-y-4" onSubmit={handleSendOtp}>
      <p className="text-sm text-stone-400">
        We will email a one-time code to your Sarveda account. Works for migrated customers without a
        password.
      </p>
      <div>
        <label htmlFor="otp-email" className="sr-only">
          Email
        </label>
        <input
          id="otp-email"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="Email"
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
        {submitting ? "Sending…" : "Send OTP"}
      </button>
    </form>
  );
}
