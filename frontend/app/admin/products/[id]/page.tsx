"use client";

import { useParams } from "next/navigation";

import { ProductForm } from "@/components/admin/ProductForm";

export default function AdminProductEditPage() {
  const params = useParams();
  const id = typeof params.id === "string" ? params.id : "";
  return <ProductForm productId={id} />;
}
