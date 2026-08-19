"use client";

import Link from "next/link";
import { FormEvent, Suspense, useEffect, useState, type ReactNode } from "react";
import { useSearchParams } from "next/navigation";

import { fetchMe } from "@/lib/auth-client";
import { EnquiryFilePicker } from "@/components/enquiries/EnquiryFilePicker";
import { PaymentSuccessMark } from "@/components/orders/PaymentSuccessMark";
import { submitEnquiry } from "@/lib/enquiry-api";
import {
  enquiryEmail,
  whatsAppSiteUrl
} from "@/lib/enquiry";
import {
  COMPANY_REGISTERED_ADDRESS,
  COMPANY_WAREHOUSE_ADDRESS,
  companySalesWhatsAppDisplay,
  companySalesWhatsAppUrl
} from "@/lib/company";
import {
  DEFAULT_ENQUIRY_SUBJECT,
  ENQUIRY_SUBJECT_SELECT_OPTIONS,
  type EnquirySubjectFormValue,
  type EnquirySubjectValue
} from "@/lib/enquiry-subjects";

const inputCls =
  "min-h-[44px] w-full rounded-lg border border-brand-cream-dark bg-brand-ivory py-2 pl-10 pr-3 text-sm text-brand-ink transition-shadow duration-200 focus:border-brand-gold focus:outline-none focus:ring-2 focus:ring-brand-gold/30";

const labelCls = "mb-2.5 block text-sm font-medium text-brand-ink";

function IconMailOutline() {
  return (
    <svg viewBox="0 0 24 24" className="h-7 w-7" fill="none" aria-hidden>
      <rect x="3" y="5.5" width="18" height="13" rx="2" stroke="currentColor" strokeWidth="1.6" />
      <path d="m4 7 8 6.5L20 7" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function IconPhoneOutline() {
  return (
    <svg viewBox="0 0 24 24" className="h-7 w-7" fill="none" aria-hidden>
      <path
        d="M6.8 4.5h2.4l1.3 3.2-1.7 1.3a11 11 0 0 0 6.8 6.8l1.3-1.7 3.2 1.3v2.4c0 .9-.8 1.6-1.7 1.6-7.8-.2-14-6.4-14.2-14.2 0-.9.7-1.7 1.6-1.7Z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function IconLocationOutline() {
  return (
    <svg viewBox="0 0 24 24" className="h-7 w-7" fill="none" aria-hidden>
      <path
        d="M12 21s6-5.2 6-10.5a6 6 0 1 0-12 0C6 15.8 12 21 12 21Z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      <circle cx="12" cy="10.5" r="2.2" stroke="currentColor" strokeWidth="1.6" />
    </svg>
  );
}

function ContactInfoRow({
  icon,
  children
}: {
  icon: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="flex gap-4">
      <div className="shrink-0 text-brand-forest">{icon}</div>
      <div className="min-w-0 text-sm leading-relaxed text-brand-ink">{children}</div>
    </div>
  );
}

function IconChevron() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" aria-hidden>
      <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
function IconUser() {
  return (
    <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="none" aria-hidden>
      <circle cx="12" cy="8" r="3.2" stroke="currentColor" strokeWidth="1.8" />
      <path d="M5 19.2c1.4-3 3.9-4.5 7-4.5s5.6 1.5 7 4.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}
function IconPhone() {
  return (
    <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="none" aria-hidden>
      <path
        d="M6.5 3.8h2.2l1.2 3-1.6 1.2a12.5 12.5 0 0 0 6.5 6.5l1.2-1.6 3 1.2v2.2c0 .8-.7 1.5-1.5 1.5C9.8 18.8 5.2 14.2 5 7.3c0-.8.7-1.5 1.5-1.5Z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
    </svg>
  );
}
function IconMail() {
  return (
    <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="none" aria-hidden>
      <rect x="3.5" y="6" width="17" height="12" rx="2" stroke="currentColor" strokeWidth="1.8" />
      <path d="m4.5 7.5 7.5 6 7.5-6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
function IconOrder() {
  return (
    <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="none" aria-hidden>
      <path d="M7 7h10l1.5 4.5H5.5L7 7Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
      <path d="M5.5 11.5h13V19H5.5v-7.5Z" stroke="currentColor" strokeWidth="1.8" />
      <path d="M9 15.5h6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}
function IconMessage() {
  return (
    <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="none" aria-hidden>
      <path
        d="M5 6.5h14a1.5 1.5 0 0 1 1.5 1.5v7a1.5 1.5 0 0 1-1.5 1.5H9l-4 3v-3H5A1.5 1.5 0 0 1 3.5 15V8A1.5 1.5 0 0 1 5 6.5Z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
    </svg>
  );
}
function IconClip() {
  return (
    <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="none" aria-hidden>
      <path
        d="m8.5 12.5 6-6a3.2 3.2 0 0 1 4.5 4.5l-7.2 7.2a4.2 4.2 0 0 1-6-6l7.4-7.4"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}

function FieldShell({
  icon,
  children,
  iconTop
}: {
  icon: ReactNode;
  children: ReactNode;
  iconTop?: boolean;
}) {
  return (
    <div className="relative">
      <span
        className={`pointer-events-none absolute left-3 text-brand-gold ${
          iconTop ? "top-2.5" : "top-1/2 -translate-y-1/2"
        }`}
      >
        {icon}
      </span>
      {children}
    </div>
  );
}

function resolveSubject(
  presetSubjectRaw: string,
  complaint: string,
  presetOrder: string
): EnquirySubjectFormValue {
  if (
    presetSubjectRaw === "PAYMENT" ||
    presetSubjectRaw === "ORDER" ||
    presetSubjectRaw === "COURSE" ||
    presetSubjectRaw === "CORPORATE" ||
    presetSubjectRaw === "OTHER"
  ) {
    return presetSubjectRaw;
  }
  if (complaint) return "PAYMENT";
  if (presetOrder) return "ORDER";
  return DEFAULT_ENQUIRY_SUBJECT;
}

function ContactInfoPanel() {
  const email = enquiryEmail();
  const salesWhatsApp = companySalesWhatsAppDisplay();

  return (
    <aside className="h-full min-h-0 overflow-y-auto border-b border-brand-cream-dark bg-white px-5 py-6 font-sans sm:px-7 sm:py-8 lg:border-b-0 lg:border-r lg:py-10">
      <div className="space-y-8">
        <ContactInfoRow icon={<IconMailOutline />}>
          <p className="font-semibold text-brand-forest">
            For feedback or general or bulk enquiries, contact
          </p>
          <p className="mt-2">
            Email:{" "}
            <a href={`mailto:${email}`} className="font-medium text-brand-forest underline-offset-2 hover:underline">
              {email}
            </a>
          </p>
        </ContactInfoRow>

        <div className="space-y-5">
          <p className="font-semibold text-brand-forest">
            Need help with finding the right instrument or accessory?
          </p>
          <p className="text-sm leading-relaxed text-brand-ink">
            Drop us a message on the Chatbox on the bottom right or WhatsApp us on the numbers below!
          </p>

          <ContactInfoRow icon={<IconPhoneOutline />}>
            <p className="font-semibold text-brand-forest">
              For any queries related to Sales/tracking or bulk enquiry, please WhatsApp at
            </p>
            <p className="mt-2">
              <a
                href={companySalesWhatsAppUrl()}
                target="_blank"
                rel="noreferrer"
                className="font-medium text-brand-forest underline-offset-2 hover:underline"
              >
                {salesWhatsApp}
              </a>
            </p>
            <p className="mt-3 text-xs text-brand-muted">
              General support:{" "}
              <a
                href={whatsAppSiteUrl("Hi Sarveda, I need help.")}
                target="_blank"
                rel="noreferrer"
                className="font-medium text-brand-forest underline-offset-2 hover:underline"
              >
                WhatsApp chat
              </a>
            </p>
          </ContactInfoRow>
        </div>

        <ContactInfoRow icon={<IconLocationOutline />}>
          <p className="font-semibold text-brand-forest">Warehouse Address:</p>
          <p className="mt-2">{COMPANY_WAREHOUSE_ADDRESS}</p>
        </ContactInfoRow>

        <ContactInfoRow icon={<IconLocationOutline />}>
          <p className="font-semibold text-brand-forest">Registered Address:</p>
          <p className="mt-2">{COMPANY_REGISTERED_ADDRESS}</p>
        </ContactInfoRow>
      </div>
    </aside>
  );
}

function ContactFormInner() {
  const search = useSearchParams();
  const presetOrder = search.get("orderNumber")?.trim() ?? "";
  const presetEmail = search.get("email")?.trim() ?? "";
  const presetSubjectRaw = search.get("subject")?.trim().toUpperCase() ?? "";
  const complaint = search.get("complaint")?.trim().toLowerCase() ?? "";
  const presetSubject = resolveSubject(presetSubjectRaw, complaint, presetOrder);

  const messagePlaceholder =
    complaint === "debited"
      ? "Optional — tell us if money left your account, and when."
      : complaint === "failed"
        ? "Optional — tell us what you saw when payment failed."
        : complaint === "exit"
          ? "Optional — add a note if you need help."
          : "Tell us how we can help…";

  const defaultComplaintMessage = (): string => {
    const orderBit = presetOrder ? ` for order ${presetOrder}` : "";
    if (complaint === "debited") {
      return `I want to raise a payment complaint${orderBit}. Money may have been deducted, but the order is not showing as paid.`;
    }
    if (complaint === "failed") {
      return `I want to raise a payment complaint${orderBit}. Payment failed.`;
    }
    if (complaint === "exit") {
      return `I want to raise a payment complaint${orderBit}.`;
    }
    return "";
  };

  const [name, setName] = useState("");
  const [email, setEmail] = useState(presetEmail);
  const [phone, setPhone] = useState("");
  const [subjectCategory, setSubjectCategory] = useState<EnquirySubjectFormValue>(presetSubject);
  const [orderNumber, setOrderNumber] = useState(presetOrder);
  const [message, setMessage] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [confirmText, setConfirmText] = useState<string | null>(null);

  useEffect(() => {
    setOrderNumber(presetOrder);
    setSubjectCategory(presetSubject);
    if (presetEmail) setEmail((c) => c || presetEmail);
  }, [presetOrder, presetSubject, presetEmail]);

  useEffect(() => {
    void fetchMe().then((user) => {
      if (!user) return;
      setName((c) => c || user.name?.trim() || "");
      setEmail((c) => c || user.email);
      setPhone((c) => c || user.phone?.replace(/^\+\d+/, "") || "");
    });
  }, []);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!phone.trim()) {
      setError("Please enter your phone number.");
      return;
    }
    if (!subjectCategory) {
      setError("Please select a category.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const result = await submitEnquiry({
        source: "CONTACT",
        subjectCategory,
        name: name.trim(),
        email: email.trim(),
        phone: phone.trim(),
        message: message.trim() || defaultComplaintMessage() || "I need help with my order.",
        orderNumber: orderNumber.trim() || undefined,
        attachments: files
      });
      setConfirmText(result.message);
      setSubmitted(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  if (submitted) {
    return (
      <div className="flex h-full min-h-0 flex-col items-center justify-center bg-white p-6 text-center font-sans">
        <PaymentSuccessMark className="mb-2" />
        <p className="text-2xl font-semibold text-brand-forest">Message sent</p>
        <p className="mt-3 text-sm text-brand-ink">{confirmText}</p>
        <p className="mt-2 text-xs text-brand-muted">We will reply to {email}.</p>
        <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-center">
          <Link
            href="/shop"
            className="inline-flex min-h-[44px] items-center justify-center rounded-full bg-brand-forest px-6 text-sm font-semibold text-brand-cream transition-colors hover:bg-brand-night"
          >
            Continue shopping
          </Link>
          {presetOrder ? (
            <Link
              href="/profile?tab=orders"
              className="inline-flex min-h-[44px] items-center justify-center rounded-full border border-brand-cream-dark bg-white px-6 text-sm font-medium text-brand-ink transition-colors hover:bg-brand-cream"
            >
              Your orders
            </Link>
          ) : null}
        </div>
      </div>
    );
  }

  return (
    <form
      onSubmit={(event) => void onSubmit(event)}
      className="flex h-full min-h-0 flex-col overflow-hidden bg-white px-4 py-4 font-sans sm:px-6 sm:py-5 lg:px-8 lg:py-6"
    >
      <h1 className="text-2xl font-semibold leading-tight text-brand-ink md:text-3xl lg:text-[2rem]">
        Contact US
      </h1>

      {presetOrder ? (
        <p className="mt-4 rounded-lg border border-brand-gold-pale/60 bg-brand-cream px-3 py-2.5 text-sm text-brand-ink">
          {complaint ? "Payment complaint for order " : "Order reference: "}
          <span className="font-mono font-medium">{presetOrder}</span>
        </p>
      ) : null}

      <div className="mt-5 grid min-h-0 flex-1 grid-cols-1 content-start gap-5 overflow-y-auto sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label htmlFor="contact-subject" className={labelCls}>
            What is this about? <span className="text-brand-terra">*</span>
          </label>
          <div className="relative">
            <select
              id="contact-subject"
              value={subjectCategory}
              onChange={(e) => setSubjectCategory(e.target.value as EnquirySubjectFormValue)}
              required
              className={`${inputCls} appearance-none pl-3 pr-10`}
            >
              {ENQUIRY_SUBJECT_SELECT_OPTIONS.map((opt) => (
                <option key={opt.value || "placeholder"} value={opt.value} disabled={opt.value === ""}>
                  {opt.label}
                </option>
              ))}
            </select>
            <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-brand-gold">
              <IconChevron />
            </span>
          </div>
        </div>

        <div>
          <label htmlFor="contact-name" className={labelCls}>
            Name <span className="text-brand-terra">*</span>
          </label>
          <FieldShell icon={<IconUser />}>
            <input
              id="contact-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              autoComplete="name"
              placeholder="Your name"
              className={inputCls}
            />
          </FieldShell>
        </div>
        <div>
          <label htmlFor="contact-phone" className={labelCls}>
            Phone <span className="text-brand-terra">*</span>
          </label>
          <FieldShell icon={<IconPhone />}>
            <input
              id="contact-phone"
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              required
              autoComplete="tel"
              placeholder="Phone number"
              className={inputCls}
            />
          </FieldShell>
        </div>

        <div>
          <label htmlFor="contact-email" className={labelCls}>
            Email <span className="text-brand-terra">*</span>
          </label>
          <FieldShell icon={<IconMail />}>
            <input
              id="contact-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
              placeholder="Email"
              className={inputCls}
            />
          </FieldShell>
        </div>

        <div>
          <label htmlFor="contact-order" className={labelCls}>
            Order number <span className="font-normal text-brand-muted">(optional)</span>
          </label>
          <FieldShell icon={<IconOrder />}>
            <input
              id="contact-order"
              value={orderNumber}
              onChange={(e) => setOrderNumber(e.target.value)}
              placeholder="SRV-20260600001"
              className={`${inputCls} font-mono`}
            />
          </FieldShell>
        </div>

        <div className="flex min-h-0 flex-col sm:col-span-2">
          <label htmlFor="contact-message" className={labelCls}>
            Message {complaint ? <span className="font-normal text-brand-muted">(optional)</span> : <span className="text-brand-terra">*</span>}
          </label>
          <FieldShell icon={<IconMessage />} iconTop>
            <textarea
              id="contact-message"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              required={!complaint}
              rows={4}
              placeholder={messagePlaceholder}
              className="min-h-[96px] w-full resize-none rounded-lg border border-brand-cream-dark bg-brand-ivory py-2.5 pl-10 pr-3 text-sm text-brand-ink transition-shadow duration-200 focus:border-brand-gold focus:outline-none focus:ring-2 focus:ring-brand-gold/30"
            />
          </FieldShell>
        </div>

        <div className="sm:col-span-2">
          <label className={`${labelCls} flex items-center gap-2`}>
            <span className="text-brand-gold">
              <IconClip />
            </span>
            Attachments <span className="font-normal text-brand-muted">(optional)</span>
          </label>
          <EnquiryFilePicker compact files={files} onChange={setFiles} onError={setError} disabled={loading} />
        </div>

        {error ? (
          <p className="text-sm text-red-600 sm:col-span-2" role="alert">
            {error}
          </p>
        ) : null}
      </div>

      <button
        type="submit"
        disabled={loading}
        className="sv-contact-cta mt-5 inline-flex min-h-[46px] w-full shrink-0 items-center justify-center rounded-xl px-6 text-sm font-semibold text-white shadow-gold transition-opacity hover:opacity-95 disabled:opacity-60"
      >
        {loading ? "Uploading & sending…" : "Send message"}
      </button>
    </form>
  );
}

export function ContactPageClient() {
  useEffect(() => {
    const html = document.documentElement;
    const body = document.body;
    const prevHtml = html.style.overflow;
    const prevBody = body.style.overflow;
    html.style.overflow = "hidden";
    body.style.overflow = "hidden";
    return () => {
      html.style.overflow = prevHtml;
      body.style.overflow = prevBody;
    };
  }, []);

  return (
    <div className="relative h-[calc(100dvh-var(--storefront-header-live-offset)-4.5rem-env(safe-area-inset-bottom,0px))] overflow-hidden bg-brand-cream p-2 md:h-[calc(100dvh-var(--storefront-header-live-offset)-var(--storefront-slim-footer-offset))] md:p-2.5">
      <div className="relative z-[1] grid h-full min-h-0 grid-rows-[auto_minmax(0,1fr)] overflow-hidden rounded-2xl border border-brand-cream-dark bg-white shadow-card lg:grid-cols-2 lg:grid-rows-none">
        <ContactInfoPanel />
        <Suspense fallback={<p className="p-8 text-sm text-brand-muted">Loading form…</p>}>
          <ContactFormInner />
        </Suspense>
      </div>
    </div>
  );
}
