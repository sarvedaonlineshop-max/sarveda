import { redirect } from "next/navigation";

export default function AdminMentorsPage() {
  redirect("/admin/content?type=mentors");
}
