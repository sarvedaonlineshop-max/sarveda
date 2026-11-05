"use client";

import { Suspense } from "react";

import AdminQuotationsPageInner from "./QuotationsPageClient";

export default function AdminQuotationsPage() {
  return (
    <Suspense fallback={<div style={{ padding: 24 }}>Loading quotations…</div>}>
      <AdminQuotationsPageInner />
    </Suspense>
  );
}
