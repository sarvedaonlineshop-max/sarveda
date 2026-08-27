"use client";

import { FormEvent, useState } from "react";

import type { PublicUser } from "@/lib/auth-client";
import { sendLoginOtp, verifyLoginOtp } from "@/lib/auth-client";

const BTN_GREEN =
  "w-full rounded-full bg-[#166D46] py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#145a3a] disabled:opacity-60 sm:py-3";

type OtpLoginFormProps = {
  inputClass: string;
  onSuccess: (user: PublicUser) => void;
  initialEmail?: string;
  compact?: boolean;
};

type OtpStep = "email" | "code";

export function OtpLoginForm({
  inputClass,
  onSuccess,
  initialEmail = "",
  compact = false
}: OtpLoginFormProps) {
  const [step, setStep] = useState<OtpStep>("email");
  const [email, setEmail] = useState(initialEmail);
  const [code, setCode] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState("");
  const [info, setInfo] = useState("");
  const stack = compact ? "space-y-3" : "space-y-4";

  async function handleSendOtp(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setMessage("");
    setInfo("");
    try {
      await sendLoginOtp(email);
      setStep("code");
      setCode("");
      setInfo(`An OTP has been sent to ${email.trim().toLowerCase()}.`);
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
      setInfo("A new code has been sent.");
    } catch (ex) {
      setMessage(ex instanceof Error ? ex.message : "Could not resend OTP");
    } finally {
      setSubmitting(false);
    }
  }

  if (step === "code") {
    return (
      <form className={stack} onSubmit={handleVerifyOtp}>
        {info ? (
          <p className="rounded-xl border border-[#166D46]/20 bg-[#166D46]/5 px-3 py-2 text-sm text-brand-ink">
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
          <p className="text-sm text-red-600" role="alert">
            {message}
          </p>
        ) : null}
        <button type="submit" disabled={submitting || code.length !== 6} className={BTN_GREEN}>
          {submitting ? "Verifying…" : "Verify & sign in"}
        </button>
        <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
          <button
            type="button"
            className="text-brand-ink/70 hover:text-[#166D46]"
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
            className="font-medium text-[#166D46] hover:text-[#145a3a] disabled:opacity-60"
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
    <form className={stack} onSubmit={handleSendOtp}>
      <p className="text-sm text-brand-ink/80">An OTP will be sent to the email below.</p>
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
        <p className="text-sm text-red-600" role="alert">
          {message}
        </p>
      ) : null}
      <button type="submit" disabled={submitting} className={BTN_GREEN}>
        {submitting ? "Sending…" : "Send OTP"}
      </button>
    </form>
  );
}
