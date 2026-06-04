import type { AdminContentType } from "@/lib/admin-api";
import { parseCourseExtra } from "@/lib/content-meta";

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
  teachers: string[];
  duration: string;
  courseStartDate: string;
  courseEndDate: string;
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
  teachers: [""],
  duration: "",
  courseStartDate: "",
  courseEndDate: ""
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
    teachers: [""],
    duration: "",
    courseStartDate: "",
    courseEndDate: ""
  };

  if (type !== "courses") {
    return base;
  }

  const extra = parseCourseExtra(item.extra as Record<string, unknown> | null);
  const teachers = extra.teachers?.filter(Boolean) ?? [];

  return {
    ...base,
    imageUrl: (item.imageUrl as string) ?? "",
    shortDescription: (item.shortDescription as string) ?? "",
    seoKeyword: extra.seoKeyword ?? "",
    teachers: teachers.length > 0 ? teachers : [""],
    duration: extra.duration ?? "",
    courseStartDate: isoDateToInput(extra.startDate),
    courseEndDate: isoDateToInput(extra.endDate)
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
  } else if (type === "blog") {
    base.title = values.title.trim();
    base.content = values.body;
    base.seoKeyword = values.seoKeyword.trim() || null;
  } else if (type === "pages") {
    base.title = values.title.trim();
    base.content = values.body.trim() || null;
  } else if (type === "courses") {
    base.title = values.title.trim();
    base.description = values.body.trim() || null;
    base.imageUrl = values.imageUrl.trim() || null;
    base.shortDescription = values.shortDescription.trim() || null;
    base.teachers = values.teachers.map((t) => t.trim()).filter(Boolean);
    base.duration = values.duration.trim() || null;
    base.courseStartDate = values.courseStartDate.trim() || null;
    base.courseEndDate = values.courseEndDate.trim() || null;
    base.seoKeyword = values.seoKeyword.trim() || null;
  } else {
    base.title = values.title.trim();
    base.description = values.body.trim() || null;
  }

  if (type === "events" && values.startDate) {
    base.startDate = new Date(values.startDate).toISOString();
  }

  return base;
}
