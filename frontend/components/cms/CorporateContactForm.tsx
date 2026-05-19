"use client";

import { FormEvent, useState } from "react";

import { CORPORATE_CONTACT } from "@/lib/corporate-wellness-data";

export function CorporateContactForm() {
  const [submitted, setSubmitted] = useState(false);

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const data = new FormData(form);
    const name = String(data.get("name") ?? "");
    const email = String(data.get("email") ?? "");
    const phone = String(data.get("phone") ?? "");
    const message = String(data.get("query") ?? "");

    const subject = encodeURIComponent(`Corporate Wellness enquiry from ${name}`);
    const body = encodeURIComponent(
      `Name: ${name}\nEmail: ${email}\nPhone: ${phone}\n\nMessage:\n${message}`
    );
    window.location.href = `mailto:${CORPORATE_CONTACT.emails[0]}?subject=${subject}&body=${body}`;
    setSubmitted(true);
  }

  if (submitted) {
    return (
      <p className="rounded-xl bg-[#f0f7f4] px-6 py-8 text-center text-stone-700">
        Thank you. Your email app should open with your message — send it and our team will reply within 24 hours.
      </p>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-6">
      <div>
        <label htmlFor="cw-name" className="mb-2 block text-sm font-medium text-stone-800">
          Name
        </label>
        <input
          id="cw-name"
          name="name"
          type="text"
          required
          className="w-full border-0 border-b border-stone-300 bg-transparent py-2 text-stone-900 outline-none focus:border-[#108967]"
        />
      </div>
      <div>
        <label htmlFor="cw-email" className="mb-2 block text-sm font-medium text-stone-800">
          Mail
        </label>
        <input
          id="cw-email"
          name="email"
          type="email"
          required
          className="w-full border-0 border-b border-stone-300 bg-transparent py-2 text-stone-900 outline-none focus:border-[#108967]"
        />
      </div>
      <div>
        <label htmlFor="cw-phone" className="mb-2 block text-sm font-medium text-stone-800">
          Phone
        </label>
        <input
          id="cw-phone"
          name="phone"
          type="tel"
          className="w-full border-0 border-b border-stone-300 bg-transparent py-2 text-stone-900 outline-none focus:border-[#108967]"
        />
      </div>
      <div>
        <label htmlFor="cw-message" className="mb-2 block text-sm font-medium text-stone-800">
          Message
        </label>
        <textarea
          id="cw-message"
          name="query"
          rows={3}
          required
          placeholder="Write your message..."
          className="w-full resize-none border-0 border-b border-stone-300 bg-transparent py-2 text-stone-900 outline-none placeholder:text-stone-400 focus:border-[#108967]"
        />
      </div>
      <div className="flex justify-end pt-2">
        <button
          type="submit"
          className="rounded-full bg-[#108967] px-8 py-3 text-sm font-semibold text-white transition hover:bg-[#0d7354]"
        >
          Send Message
        </button>
      </div>
    </form>
  );
}
