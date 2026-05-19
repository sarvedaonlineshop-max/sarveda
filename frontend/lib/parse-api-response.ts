export type ApiSuccess<T> = { success: true; data: T };
export type ApiErrorBody = { success: false; error: string; code?: string };

/** Parse JSON API body; never throw SyntaxError on rate-limit HTML/plain text. */
export async function parseApiResponse<T>(
  res: Response
): Promise<ApiSuccess<T> | ApiErrorBody> {
  const text = await res.text();
  if (!text.trim()) {
    return {
      success: false,
      error: res.status === 429 ? "Too many requests" : `Empty response (${res.status})`,
      code: res.status === 429 ? "RATE_LIMITED" : "EMPTY_RESPONSE"
    };
  }
  try {
    return JSON.parse(text) as ApiSuccess<T> | ApiErrorBody;
  } catch {
    const preview = text.replace(/\s+/g, " ").slice(0, 80);
    return {
      success: false,
      error:
        res.status === 429
          ? "Too many requests"
          : `Invalid API response (${res.status}): ${preview}`,
      code: res.status === 429 ? "RATE_LIMITED" : "INVALID_JSON"
    };
  }
}
