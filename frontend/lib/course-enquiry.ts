import { buildCourseEnquiryMessage } from "./enquiry";
import { parseApiResponse } from "./parse-api-response";

export async function submitCourseEnquiry(body: {
  email: string;
  name?: string;
  courseTitle: string;
  courseUrl: string;
  message?: string;
}): Promise<{ message: string }> {
  const res = await fetch("/api/contact/course-enquiry", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email: body.email.trim(),
      name: body.name?.trim() || undefined,
      courseTitle: body.courseTitle.trim(),
      courseUrl: body.courseUrl.trim(),
      message: (body.message?.trim() || buildCourseEnquiryMessage(body.courseTitle.trim())).slice(0, 5000)
    })
  });
  const json = await parseApiResponse<{ message?: string }>(res);
  if (!res.ok || !json.success) {
    throw new Error(json.success ? `Request failed: ${res.status}` : json.error);
  }
  return { message: json.data.message ?? "Thank you — we will reply shortly." };
}
