export type ApiFieldError = { path: string; message: string };

export class AdminApiError extends Error {
  fields?: ApiFieldError[];
  status?: number;
  code?: string;

  constructor(message: string, init?: { fields?: ApiFieldError[]; status?: number; code?: string }) {
    super(message);
    this.name = "AdminApiError";
    this.fields = init?.fields;
    this.status = init?.status;
    this.code = init?.code;
  }
}

/** Map API / Zod paths to form tab for navigation on error. */
export function tabForFieldPath(
  path: string
): "general" | "variants" | "media" | "barcodes" | "seo" {
  if (path.startsWith("variants")) return "variants";
  if (path.startsWith("images")) return "media";
  if (path.startsWith("accordionItems")) return "media";
  if (["seoTitle", "seoDescription", "seoKeyword"].some((k) => path === k || path.startsWith(k))) {
    return "seo";
  }
  return "general";
}

export function fieldErrorsFromMessage(message: string): Record<string, string> {
  const map: Record<string, string> = {};
  for (const part of message.split(";")) {
    const trimmed = part.trim();
    const idx = trimmed.indexOf(":");
    if (idx > 0) {
      map[trimmed.slice(0, idx).trim()] = trimmed.slice(idx + 1).trim();
    }
  }
  return map;
}

export function applyApiError(
  ex: unknown,
  setErr: (s: string | null) => void,
  setFieldErrors: (m: Record<string, string>) => void,
  setTab?: (t: "general" | "variants" | "media" | "seo") => void
) {
  let message = "Request failed";
  let fields: ApiFieldError[] | undefined;

  if (ex instanceof AdminApiError) {
    message = ex.message;
    fields = ex.fields;
  } else if (ex instanceof Error) {
    message = ex.message;
    fields = (ex as Error & { fields?: ApiFieldError[] }).fields;
  }

  const map: Record<string, string> = {};
  if (fields?.length) {
    for (const f of fields) map[f.path] = f.message;
  } else {
    Object.assign(map, fieldErrorsFromMessage(message));
  }

  if (ex instanceof AdminApiError && ex.code === "SLUG_EXISTS") {
    map.slug = message;
  }
  if (ex instanceof AdminApiError && ex.code === "SKU_EXISTS") {
    map["variants.0.sku"] = message;
  }
  if (ex instanceof AdminApiError && ex.code === "VALIDATION_ERROR" && !Object.keys(map).length) {
    Object.assign(map, fieldErrorsFromMessage(message));
  }

  setFieldErrors(map);
  setErr(message);

  if (setTab && Object.keys(map).length > 0) {
    setTab(tabForFieldPath(Object.keys(map)[0]!));
  }
}
