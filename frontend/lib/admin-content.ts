import type { AdminContentType } from "@/lib/admin-api";
import { parseCourseExtra, parseCourseSchedule } from "@/lib/content-meta";
import type { CourseFaqForm } from "@/components/admin/CourseFaqFields";
import { emptyCurriculumModule } from "@/components/admin/CourseCurriculumFields";
import {
  emptyCourseSchedule,
  type CourseScheduleForm
} from "@/components/admin/CourseScheduleFields";
import { emptyCourseSession } from "@/components/admin/CourseSessionFields";
import type {
  CourseCurriculumModule,
  CourseLayoutTemplate,
  CourseSession
} from "@/lib/course-sessions";
import { htmlHasSessionBlocks, stripSessionsFromHtml } from "@/lib/course-sessions";
import { courseDurationHours } from "@/lib/content-meta";

export function contentUsesName(type: AdminContentType) {
  return type === "vaidyas" || type === "mentors";
}

export function contentUsesAuthor(type: AdminContentType) {
  return type === "testimonials";
}

export function contentTitleLabel(type: AdminContentType) {
  if (contentUsesAuthor(type)) return "Author name";
  if (contentUsesName(type)) return "Name";
  return "Title";
}

export function contentBodyLabel(type: AdminContentType) {
  if (contentUsesName(type)) return "Bio";
  if (contentUsesAuthor(type)) return "Quote / body";
  return "Content / description";
}

export function contentStatusOptions(type: AdminContentType): { value: string; label: string }[] {
  if (type === "events") {
    return [
      { value: "DRAFT", label: "Draft" },
      { value: "PUBLISHED", label: "Published" },
      { value: "CANCELLED", label: "Cancelled" }
    ];
  }
  if (type === "vaidyas" || type === "mentors" || type === "retreats" || type === "offers") {
    return [
      { value: "ACTIVE", label: "Active" },
      { value: "DRAFT", label: "Draft / inactive" }
    ];
  }
  if (type === "testimonials") {
    return [
      { value: "PUBLISHED", label: "Published" },
      { value: "DRAFT", label: "Draft" }
    ];
  }
  return [
    { value: "DRAFT", label: "Draft" },
    { value: "PUBLISHED", label: "Published" },
    { value: "ARCHIVED", label: "Archived" }
  ];
}

export type ContentFormValues = {
  title: string;
  slug: string;
  status: string;
  body: string;
  seoTitle: string;
  seoDescription: string;
  seoKeyword: string;
  startDate: string;
  imageUrl: string;
  shortDescription: string;
  mentorIds: string[];
  layoutTemplate: CourseLayoutTemplate;
  durationHours: string;
  courseSessions: CourseSession[];
  courseCurriculum: CourseCurriculumModule[];
  courseStartDate: string;
  courseEndDate: string;
  videoUrl: string;
  courseMode: string;
  courseVenue: string;
  courseTimings: string;
  courseIncludes: string;
  aboutTheCourse: string;
  courseFaqs: CourseFaqForm[];
  courseSchedule: CourseScheduleForm[];
  expertise: string;
  speciality: string;
  courseIsFree: boolean;
  priceInr: string;
  priceUsd: string;
  enrollmentMode: string;
  checkoutVariantSku: string;
};

export const emptyContentForm: ContentFormValues = {
  title: "",
  slug: "",
  status: "DRAFT",
  body: "",
  seoTitle: "",
  seoDescription: "",
  seoKeyword: "",
  startDate: "",
  imageUrl: "",
  shortDescription: "",
  mentorIds: [],
  layoutTemplate: "STANDARD",
  durationHours: "",
  courseSessions: [{ ...emptyCourseSession, sessionId: "1" }],
  courseCurriculum: [{ ...emptyCurriculumModule }],
  courseStartDate: "",
  courseEndDate: "",
  videoUrl: "",
  courseMode: "",
  courseVenue: "",
  courseTimings: "",
  courseIncludes: "",
  aboutTheCourse: "",
  courseFaqs: [{ question: "", answer: "" }],
  courseSchedule: [{ ...emptyCourseSchedule }],
  expertise: "",
  speciality: "",
  courseIsFree: false,
  priceInr: "",
  priceUsd: "",
  enrollmentMode: "ENQUIRY",
  checkoutVariantSku: ""
};

function isoDateToInput(raw: string | null | undefined): string {
  if (!raw?.trim()) return "";
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) {
    return raw.trim().slice(0, 10);
  }
  return d.toISOString().slice(0, 10);
}

export function itemToFormValues(type: AdminContentType, item: Record<string, unknown>): ContentFormValues {
  const title =
    (item.title as string) ??
    (item.name as string) ??
    (item.authorName as string) ??
    "";
  const body =
    (item.content as string) ??
    (item.description as string) ??
    (item.bio as string) ??
    (item.body as string) ??
    "";
  const status = (item.status as string) ?? "DRAFT";

  const base: ContentFormValues = {
    title,
    slug: (item.slug as string) ?? "",
    status,
    body,
    seoTitle: (item.seoTitle as string) ?? "",
    seoDescription: (item.seoDescription as string) ?? "",
    seoKeyword: (item.seoKeyword as string) ?? "",
    startDate: item.startDate
      ? new Date(item.startDate as string).toISOString().slice(0, 16)
      : "",
    imageUrl: "",
    shortDescription: "",
    mentorIds: [],
    layoutTemplate: "STANDARD",
    durationHours: "",
    courseSessions: [{ ...emptyCourseSession, sessionId: "1" }],
    courseCurriculum: [{ ...emptyCurriculumModule }],
    courseStartDate: "",
    courseEndDate: "",
    videoUrl: "",
    courseMode: "",
    courseVenue: "",
    courseTimings: "",
    courseIncludes: "",
    aboutTheCourse: "",
    courseFaqs: [{ question: "", answer: "" }],
    courseSchedule: [{ ...emptyCourseSchedule }],
    expertise: "",
    speciality: "",
    courseIsFree: false,
    priceInr: "",
    priceUsd: "",
    enrollmentMode: "ENQUIRY",
    checkoutVariantSku: ""
  };

  if (type === "mentors" || type === "vaidyas") {
    return {
      ...base,
      imageUrl: (item.photoUrl as string) ?? "",
      expertise: (item.expertise as string) ?? "",
      speciality: (item.speciality as string) ?? ""
    };
  }

  if (type !== "courses") {
    return base;
  }

  const extra = parseCourseExtra(item.extra as Record<string, unknown> | null);
  const hours = courseDurationHours(extra);
  const layoutTemplate =
    extra.layoutTemplate ??
    (extra.sessions?.length && extra.sessions.length >= 2
      ? "SESSIONS"
      : extra.curriculum?.length && extra.curriculum.length >= 2
        ? "CURRICULUM"
        : "STANDARD");
  let courseBody =
    (item.description as string) ??
    (item.content as string) ??
    "";
  if (layoutTemplate === "SESSIONS" && htmlHasSessionBlocks(courseBody)) {
    courseBody = stripSessionsFromHtml(courseBody);
  }

  return {
    ...base,
    body: courseBody,
    imageUrl: (item.imageUrl as string) ?? "",
    shortDescription: (item.shortDescription as string) ?? "",
    seoKeyword: extra.seoKeyword ?? "",
    mentorIds: Array.isArray(extra.mentorIds) ? extra.mentorIds : [],
    layoutTemplate,
    durationHours: hours != null ? String(hours) : "",
    courseSessions:
      extra.sessions?.length
        ? extra.sessions.map((s) => ({
            sessionId: s.sessionId ?? "",
            name: s.name ?? "",
            mentorId: s.mentorId ?? null,
            teacherName: s.teacherName ?? "",
            content: s.content ?? "",
            scheduledAt: s.scheduledAt ?? "",
            scheduleNote: s.scheduleNote ?? ""
          }))
        : [{ ...emptyCourseSession, sessionId: "1" }],
    courseCurriculum:
      extra.curriculum?.length
        ? extra.curriculum.map((m) => ({
            name: m.name ?? "",
            hours: m.hours ?? null,
            priceInr: m.priceInr ?? null,
            priceUsd: m.priceUsd ?? null,
            startDate: m.startDate ?? "",
            endDate: m.endDate ?? ""
          }))
        : [{ ...emptyCurriculumModule }],
    courseStartDate: isoDateToInput(extra.startDate),
    courseEndDate: isoDateToInput(extra.endDate),
    videoUrl: (item.videoUrl as string) ?? extra.videoLink ?? "",
    courseMode: extra.mode ?? "",
    courseVenue: extra.venue ?? "",
    courseTimings: extra.timings ?? "",
    courseIncludes: extra.courseIncludes ?? "",
    aboutTheCourse: extra.aboutTheCourse ?? "",
    courseFaqs:
      extra.faqs?.length
        ? extra.faqs.map((f) => ({ question: f.question, answer: f.answer }))
        : [{ question: "", answer: "" }],
    courseSchedule: (() => {
      const rows = parseCourseSchedule(extra);
      return rows.length
        ? rows.map((r) => ({
            startDate: isoDateToInput(r.startDate),
            endDate: isoDateToInput(r.endDate),
            mode: r.mode ?? "",
            location: r.location ?? "",
            timings: r.timings ?? "",
            duration: r.duration ?? ""
          }))
        : [{ ...emptyCourseSchedule }];
    })(),
    courseIsFree: Boolean(item.isFree),
    priceInr:
      typeof item.priceInPaise === "number" && item.priceInPaise > 0
        ? String(item.priceInPaise / 100)
        : "",
    priceUsd:
      typeof item.priceUsdCents === "number" && item.priceUsdCents > 0
        ? String(item.priceUsdCents / 100)
        : "",
    enrollmentMode: (item.enrollmentMode as string) ?? "ENQUIRY",
    checkoutVariantSku: (item.checkoutVariantSku as string) ?? ""
  };
}

export function formValuesToPayload(type: AdminContentType, values: ContentFormValues) {
  const base: Record<string, unknown> = {
    slug: values.slug.trim() || undefined,
    status: values.status,
    seoTitle: values.seoTitle.trim() || null,
    seoDescription: values.seoDescription.trim() || null
  };

  if (contentUsesAuthor(type)) {
    base.authorName = values.title.trim();
    base.body = values.body.trim() || null;
  } else if (contentUsesName(type)) {
    base.name = values.title.trim();
    base.bio = values.body.trim() || null;
    base.photoUrl = values.imageUrl.trim() || null;
    if (type === "mentors") {
      base.expertise = values.expertise.trim() || null;
    }
    if (type === "vaidyas") {
      base.speciality = values.speciality.trim() || null;
    }
  } else if (type === "blog") {
    base.title = values.title.trim();
    base.content = values.body;
    base.seoKeyword = values.seoKeyword.trim() || null;
  } else if (type === "pages") {
    base.title = values.title.trim();
    base.content = values.body.trim() || null;
  } else if (type === "courses") {
    const rupees = parseFloat(values.priceInr.replace(/,/g, "")) || 0;
    const priceInPaise = values.courseIsFree ? 0 : Math.round(Math.max(0, rupees) * 100);
    const usd = parseFloat(values.priceUsd.replace(/,/g, ""));
    const priceUsdCents =
      !values.courseIsFree && Number.isFinite(usd) && usd > 0 ? Math.round(usd * 100) : null;

    base.title = values.title.trim();
    let description = values.body.trim();
    if (values.layoutTemplate === "SESSIONS" && htmlHasSessionBlocks(description)) {
      description = stripSessionsFromHtml(description);
    }
    base.description = description || null;
    base.imageUrl = values.imageUrl.trim() || null;
    base.shortDescription = values.shortDescription.trim() || null;
    base.mentorIds = values.mentorIds;
    base.layoutTemplate = values.layoutTemplate;
    const hours = parseFloat(values.durationHours.replace(/,/g, ""));
    base.durationHours = Number.isFinite(hours) && hours > 0 ? hours : null;
    base.duration =
      Number.isFinite(hours) && hours > 0
        ? hours === 1
          ? "1 hour"
          : `${hours} hours`
        : null;
    base.sessions = values.courseSessions
      .map((s) => ({
        sessionId: s.sessionId.trim(),
        name: s.name.trim(),
        mentorId: s.mentorId?.trim() || null,
        teacherName: s.teacherName?.trim() || null,
        content: s.content.trim(),
        scheduledAt: s.scheduledAt?.trim() || null,
        scheduleNote: s.scheduleNote?.trim() || null
      }))
      .filter((s) => s.name);
    base.curriculum = values.courseCurriculum
      .map((m) => ({
        name: m.name.trim(),
        hours: m.hours ?? null,
        priceInr: m.priceInr ?? null,
        priceUsd: m.priceUsd ?? null,
        startDate: m.startDate?.trim() || null,
        endDate: m.endDate?.trim() || null
      }))
      .filter((m) => m.name);
    base.courseStartDate = values.courseStartDate.trim() || null;
    base.courseEndDate = values.courseEndDate.trim() || null;
    base.videoUrl = values.videoUrl.trim() || null;
    base.mode = values.courseMode.trim() || null;
    base.venue = values.courseVenue.trim() || null;
    base.timings = values.courseTimings.trim() || null;
    base.courseIncludes = values.courseIncludes.trim() || null;
    base.aboutTheCourse = values.aboutTheCourse.trim() || null;
    base.faqs = values.courseFaqs
      .map((f) => ({ question: f.question.trim(), answer: f.answer.trim() }))
      .filter((f) => f.question && f.answer);
    base.schedule = values.courseSchedule
      .map((r) => ({
        startDate: r.startDate.trim() || null,
        endDate: r.endDate.trim() || null,
        mode: r.mode.trim() || null,
        location: r.location.trim() || null,
        timings: r.timings.trim() || null,
        duration: r.duration.trim() || null
      }))
      .filter(
        (r) =>
          r.startDate || r.endDate || r.mode || r.location || r.timings || r.duration
      );
    base.seoKeyword = values.seoKeyword.trim() || null;
    base.isFree = values.courseIsFree;
    base.priceInPaise = priceInPaise;
    base.priceUsdCents = priceUsdCents;
    base.enrollmentMode = values.enrollmentMode;
    base.checkoutVariantSku = values.checkoutVariantSku.trim() || null;
  } else {
    base.title = values.title.trim();
    base.description = values.body.trim() || null;
  }

  if (type === "events" && values.startDate) {
    base.startDate = new Date(values.startDate).toISOString();
  }

  return base;
}
