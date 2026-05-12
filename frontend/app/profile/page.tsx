import { MobileSubpageHeader } from "@/components/layout/MobileSubpageHeader";
import { ProfileClient } from "@/components/profile/ProfileClient";

export const metadata = {
  title: "You",
  description: "Your Sarveda account and orders"
};

export default function ProfilePage() {
  return (
    <div className="min-h-[60vh] bg-stone-50 md:py-10">
      <MobileSubpageHeader title="You" backHref="/" />
      <div className="mx-auto max-w-2xl py-4 md:rounded-3xl md:border md:border-stone-200 md:bg-white md:p-8">
        <h1 className="hidden px-4 text-3xl font-semibold text-stone-900 md:block md:px-0">You</h1>
        <div className="md:mt-6">
          <ProfileClient />
        </div>
      </div>
    </div>
  );
}
