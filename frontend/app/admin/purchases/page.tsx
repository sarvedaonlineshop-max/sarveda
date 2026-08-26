import { redirect } from "next/navigation";

export default function AdminPurchasesIndexPage() {
  redirect("/admin/purchases/purchase-orders");
}
