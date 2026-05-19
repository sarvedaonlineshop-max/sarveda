"use client";

import { useParams } from "next/navigation";

import { ContentForm } from "@/components/admin/ContentForm";
import { ADMIN_CONTENT_TYPES, type AdminContentType } from "@/lib/admin-api";

function parseType(raw: string): AdminContentType | null {
  if ((ADMIN_CONTENT_TYPES as readonly string[]).includes(raw)) {
    return raw as AdminContentType;
  }
  return null;
}

export default function AdminContentEditPage() {
  const params = useParams();
  const type = typeof params.type === "string" ? parseType(params.type) : null;
  const id = typeof params.id === "string" ? params.id : "";

  if (!type) {
    return <p className="text-red-600">Invalid content type.</p>;
  }

  return <ContentForm type={type} itemId={id} />;
}
