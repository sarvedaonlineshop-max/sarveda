import { ProfileClient } from "@/components/profile/ProfileClient";

export const metadata = {
  title: "My account",
  description: "Your Sarveda account and orders",
  robots: { index: false, follow: false }
};

export default function ProfilePage() {
  return (
    <div className="min-h-[60vh] bg-brand-cream md:py-10">
      <div className="mx-auto max-w-2xl py-4 md:rounded-3xl md:border md:border-brand-cream-dark md:bg-white md:p-8">
        <ProfileClient />
      </div>
    </div>
  );
}
