"use client";

import { Suspense } from "react";

import AdminReturnsPageInner from "./ReturnsPageClient";

export default function AdminReturnsPage() {
  return (
    <Suspense fallback={<div style={{ padding: 24 }}>Loading returns…</div>}>
      <AdminReturnsPageInner />
    </Suspense>
  );
}
