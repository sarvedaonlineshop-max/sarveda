import { MobileSubpageHeader } from "@/components/layout/MobileSubpageHeader";
import { ProfileClient } from "@/components/profile/ProfileClient";

export const metadata = {
  title: "My account",
  description: "Your Sarveda account and orders",
  robots: { index: false, follow: false }
};

export default function ProfilePage() {
  return (
    <div className="min-h-[60vh] bg-brand-cream md:py-10">
      <MobileSubpageHeader title="My account" backHref="/" />
      <div className="mx-auto max-w-2xl py-4 md:rounded-3xl md:border md:border-brand-cream-dark md:bg-white md:p-8">
        <h1 className="hidden px-4 font-serif text-3xl font-semibold text-brand-ink md:block md:px-0">My account</h1>
        <div className="md:mt-6">
          <ProfileClient />
        </div>
      </div>
    </div>
  );
}
