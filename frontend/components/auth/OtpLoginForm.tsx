"use client";

import { FormEvent, useState } from "react";

import type { PublicUser } from "@/lib/auth-client";
import { sendLoginOtp, verifyLoginOtp } from "@/lib/auth-client";

const BTN_GREEN =
  "w-full rounded-full bg-[#4a8c3f] py-3 text-sm font-bold text-white shadow-[0_12px_28px_rgba(74,140,63,0.28)] transition duration-300 hover:-translate-y-0.5 hover:bg-[#3f7a36] hover:shadow-[0_16px_34px_rgba(74,140,63,0.34)] disabled:opacity-60";

type OtpLoginFormProps = {
  inputClass: string;
  onSuccess: (user: PublicUser) => void;
  initialEmail?: string;
  compact?: boolean;
  onEmailChange?: (email: string) => void;
};

type OtpStep = "email" | "code";

export function OtpLoginForm({
  inputClass,
  onSuccess,
  initialEmail = "",
  compact = false,
  onEmailChange
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
      setInfo(`A secure OTP has been sent to ${email.trim().toLowerCase()}.`);
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
      setInfo("A new OTP has been sent.");
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
          <p className="rounded-2xl border border-[#4a8c3f]/20 bg-[#4a8c3f]/5 px-3 py-2 text-sm text-brand-ink">
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
            className="text-brand-ink/70 hover:text-[#4a8c3f]"
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
            className="font-medium text-[#4a8c3f] hover:text-[#3f7a36] disabled:opacity-60"
            disabled={submitting}
            onClick={() => void handleResend()}
          >
            Resend OTP
          </button>
        </div>
      </form>
    );
  }

  return (
    <form className={stack} onSubmit={handleSendOtp}>
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
          onChange={(e) => {
            setEmail(e.target.value);
            onEmailChange?.(e.target.value);
          }}
          placeholder="Enter your email address"
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
      <p className="min-h-[1rem] text-center text-xs text-brand-ink/55">
        We’ll send a secure OTP to your email address.
      </p>
    </form>
  );
}
