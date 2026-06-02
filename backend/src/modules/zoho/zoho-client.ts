import { zohoEnv } from "../../config/env";
import { logger } from "../../config/logger";

import { getZohoAccessToken } from "./zoho-auth";

const BASE_URL = zohoEnv.ZOHO_BOOKS_BASE_URL;
const ORG_ID = zohoEnv.ZOHO_ORGANIZATION_ID;

async function zohoFetch<T>(path: string, method: string, body?: object): Promise<T> {
  const token = await getZohoAccessToken();
  const url = new URL(`${BASE_URL}${path}`);
  url.searchParams.set("organization_id", ORG_ID);

  const res = await fetch(url.toString(), {
    method,
    headers: {
      Authorization: `Zoho-oauthtoken ${token}`,
      "Content-Type": "application/json"
    },
    body: body ? JSON.stringify(body) : undefined
  });

  const data = (await res.json()) as T & { code?: number; message?: string };
  if (!res.ok || (typeof data.code === "number" && data.code !== 0)) {
    logger.error("Zoho API error", { path, method, code: data.code, message: data.message });
    throw new Error(`Zoho ${method} ${path} failed: ${data.message ?? "unknown_error"}`);
  }

  return data;
}

export const zohoGet = <T>(path: string) => zohoFetch<T>(path, "GET");
export const zohoPost = <T>(path: string, body: object) => zohoFetch<T>(path, "POST", body);
export const zohoPut = <T>(path: string, body: object) => zohoFetch<T>(path, "PUT", body);
