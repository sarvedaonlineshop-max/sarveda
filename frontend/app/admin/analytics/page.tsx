"use client";

import { AdminDashboardAnalytics } from "@/components/admin/AdminDashboardAnalytics";
import { useAdminPageHeader } from "@/components/admin/useAdminPageHeader";

export default function AdminAnalyticsPage() {
  useAdminPageHeader(
    () => ({
      title: "Analytics",
      icon: "🌿",
      subtitle: "Orders, products, places, returns, refunds, and customers."
    }),
    []
  );

  return <AdminDashboardAnalytics />;
}
