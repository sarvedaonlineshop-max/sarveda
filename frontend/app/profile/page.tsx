import { Suspense } from "react";

import { ProfileClient } from "@/components/profile/ProfileClient";

export const metadata = {
  title: "My account",
  description: "Your Sarveda account and orders",
  robots: { index: false, follow: false }
};

export default function ProfilePage() {
  return (
    <div className="min-h-[60vh] bg-brand-cream md:pb-10 md:pt-10">
      <div className="mx-auto max-w-5xl px-0 py-0 md:rounded-3xl md:border md:border-brand-cream-dark md:bg-white md:p-8 md:px-4 lg:max-w-6xl">
        <Suspense fallback={<p className="px-4 py-10 text-center text-stone-500">Loading your profile…</p>}>
          <ProfileClient />
        </Suspense>
      </div>
    </div>
  );
}
