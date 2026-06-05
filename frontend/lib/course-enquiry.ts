import { buildCourseEnquiryMessage } from "./enquiry";
import { parseApiResponse } from "./parse-api-response";

export async function submitCourseEnquiry(body: {
  email: string;
  courseTitle: string;
  courseUrl: string;
}): Promise<{ message: string }> {
  const res = await fetch("/api/contact/course-enquiry", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email: body.email.trim(),
      courseTitle: body.courseTitle.trim(),
      courseUrl: body.courseUrl.trim(),
      message: buildCourseEnquiryMessage(body.courseTitle.trim())
    })
  });
  const json = await parseApiResponse<{ message?: string }>(res);
  if (!res.ok || !json.success) {
    throw new Error(json.success ? `Request failed: ${res.status}` : json.error);
  }
  return { message: json.data.message ?? "Thank you — we will reply shortly." };
}
