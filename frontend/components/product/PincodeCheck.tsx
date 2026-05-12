"use client";

import { FormEvent, useState } from "react";

export function PincodeCheck() {
  const [pincode, setPincode] = useState("");
  const [message, setMessage] = useState<string | null>(null);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalized = pincode.replace(/\D/g, "");
    if (normalized.length !== 6) {
      setMessage("Enter a valid 6-digit delivery pincode.");
      return;
    }
    setMessage(`Delivery available to ${normalized}. Exact courier and ETA are confirmed at checkout.`);
  }

  return (
    <form onSubmit={handleSubmit} className="rounded-2xl border border-stone-200 bg-stone-50 p-4">
      <p className="text-sm font-semibold text-stone-900">Check delivery</p>
      <p className="mt-1 text-xs text-stone-500">Enter your pincode to see if we can ship this item to you.</p>
      <div className="mt-3 flex gap-2">
        <input
          value={pincode}
          onChange={(event) => setPincode(event.target.value)}
          inputMode="numeric"
          maxLength={6}
          placeholder="Pincode"
          className="min-h-[48px] flex-1 rounded-xl border border-stone-200 bg-white px-4 text-sm text-stone-900 focus:border-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-500/20"
        />
        <button
          type="submit"
          className="min-h-[48px] rounded-xl bg-stone-900 px-4 text-sm font-semibold text-amber-400"
        >
          Check
        </button>
      </div>
      {message ? <p className="mt-3 text-sm text-emerald-700">{message}</p> : null}
    </form>
  );
}
