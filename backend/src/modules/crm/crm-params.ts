import { z } from "zod";

import { CrmError } from "./crm-errors";

const uuidParamSchema = z.string().uuid();

/** Validate a path `:id` (or named) UUID; throws CrmError 400 on failure. */
export function requireUuidParam(value: string | undefined, label = "id"): string {
  const parsed = uuidParamSchema.safeParse(value);
  if (!parsed.success) {
    throw new CrmError(`Invalid ${label}`, "INVALID_ID", 400);
  }
  return parsed.data;
}
