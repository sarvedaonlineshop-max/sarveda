import type { AdminContentType } from "@/lib/admin-api";

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

export function itemToFormValues(type: AdminContentType, item: Record<string, unknown>) {
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
  return {
    title,
    slug: (item.slug as string) ?? "",
    status,
    body,
    seoTitle: (item.seoTitle as string) ?? "",
    seoDescription: (item.seoDescription as string) ?? "",
    seoKeyword: (item.seoKeyword as string) ?? "",
    startDate: item.startDate
      ? new Date(item.startDate as string).toISOString().slice(0, 16)
      : ""
  };
}

export function formValuesToPayload(
  type: AdminContentType,
  values: {
    title: string;
    slug: string;
    status: string;
    body: string;
    seoTitle: string;
    seoDescription: string;
    seoKeyword: string;
    startDate: string;
  }
) {
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
  } else {
    base.title = values.title.trim();
    base.description = values.body.trim() || null;
  }

  if (type === "events" && values.startDate) {
    base.startDate = new Date(values.startDate).toISOString();
  }

  return base;
}
