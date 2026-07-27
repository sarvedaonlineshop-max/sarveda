import { redirect } from "next/navigation";

/** Analytics lives on the Dashboard now. */
export default function AdminAnalyticsRedirectPage() {
  redirect("/admin");
}
