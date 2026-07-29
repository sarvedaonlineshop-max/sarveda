/**
 * One-time Etsy OAuth helper for seller apps.
 *
 * Usage:
 *   cd backend
 *   npx tsx scripts/etsy-oauth-helper.ts
 *
 * Requires in .env:
 *   ETSY_API_KEY
 *   ETSY_SHARED_SECRET (optional for refresh, recommended)
 *
 * Opens a local callback on http://localhost:3456/callback
 * and prints ETSY_ACCESS_TOKEN / ETSY_REFRESH_TOKEN / ETSY_SHOP_ID.
 */
import crypto from "crypto";
import http from "http";
import { URL } from "url";

import * as dotenv from "dotenv";

dotenv.config();

const CLIENT_ID = (process.env.ETSY_API_KEY || "").trim();
const SHARED_SECRET = (process.env.ETSY_SHARED_SECRET || "").trim();
const APP_HEADER = SHARED_SECRET ? `${CLIENT_ID}:${SHARED_SECRET}` : CLIENT_ID;
const REDIRECT_URI = "http://localhost:3456/callback";
const SCOPES = [
  "shops_r",
  "listings_r",
  "transactions_r",
  "address_r",
  "email_r"
].join(" ");

function base64Url(buf: Buffer) {
  return buf
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function makePkce() {
  const verifier = base64Url(crypto.randomBytes(32));
  const challenge = base64Url(crypto.createHash("sha256").update(verifier).digest());
  return { verifier, challenge };
}

async function exchangeCode(code: string, codeVerifier: string) {
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    client_id: CLIENT_ID,
    redirect_uri: REDIRECT_URI,
    code,
    code_verifier: codeVerifier
  });

  const res = await fetch("https://api.etsy.com/v3/public/oauth/token", {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body
  });

  const data = (await res.json()) as {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
    error?: string;
    error_description?: string;
  };

  if (!res.ok || !data.access_token) {
    throw new Error(data.error_description || data.error || `Token exchange failed (${res.status})`);
  }

  return data;
}

async function resolveShopId(accessToken: string) {
  // Prefer user shops endpoint when available.
  const meRes = await fetch("https://openapi.etsy.com/v3/application/users/me", {
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${accessToken}`,
      "x-api-key": APP_HEADER
    }
  });
  const me = (await meRes.json().catch(() => ({}))) as { user_id?: number; shop_id?: number };

  if (me.shop_id) return String(me.shop_id);

  if (me.user_id) {
    const shopsRes = await fetch(
      `https://openapi.etsy.com/v3/application/users/${me.user_id}/shops`,
      {
        headers: {
          Accept: "application/json",
          Authorization: `Bearer ${accessToken}`,
          "x-api-key": APP_HEADER
        }
      }
    );
    const shops = (await shopsRes.json().catch(() => ({}))) as {
      results?: Array<{ shop_id?: number }>;
      shop_id?: number;
    };
    if (shops.shop_id) return String(shops.shop_id);
    if (shops.results?.[0]?.shop_id) return String(shops.results[0].shop_id);
  }

  return "";
}

async function main() {
  if (!CLIENT_ID) {
    console.error("Missing ETSY_API_KEY in backend/.env");
    process.exit(1);
  }

  const state = base64Url(crypto.randomBytes(16));
  const { verifier, challenge } = makePkce();

  const authUrl = new URL("https://www.etsy.com/oauth/connect");
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("client_id", CLIENT_ID);
  authUrl.searchParams.set("redirect_uri", REDIRECT_URI);
  authUrl.searchParams.set("scope", SCOPES);
  authUrl.searchParams.set("state", state);
  authUrl.searchParams.set("code_challenge", challenge);
  authUrl.searchParams.set("code_challenge_method", "S256");

  console.log("\n=== Etsy OAuth helper ===\n");
  console.log("1) Make sure this redirect URI is allowed for your seller app:");
  console.log(`   ${REDIRECT_URI}`);
  console.log("\n2) Open this URL in your browser and authorize Sarveda Life:\n");
  console.log(authUrl.toString());
  console.log("\nWaiting for callback on http://localhost:3456/callback ...\n");

  const server = http.createServer(async (req, res) => {
    try {
      if (!req.url?.startsWith("/callback")) {
        res.writeHead(404);
        res.end("Not found");
        return;
      }

      const incoming = new URL(req.url, "http://localhost:3456");
      const code = incoming.searchParams.get("code");
      const returnedState = incoming.searchParams.get("state");
      const err = incoming.searchParams.get("error");

      if (err) {
        res.writeHead(400, { "Content-Type": "text/plain" });
        res.end(`OAuth error: ${err}`);
        console.error("OAuth error:", err);
        server.close();
        return;
      }

      if (!code || returnedState !== state) {
        res.writeHead(400, { "Content-Type": "text/plain" });
        res.end("Invalid OAuth callback");
        return;
      }

      const tokens = await exchangeCode(code, verifier);
      const shopId = await resolveShopId(tokens.access_token!);

      console.log("\n=== SUCCESS — add these to backend/.env ===\n");
      console.log(`ETSY_ACCESS_TOKEN=${tokens.access_token}`);
      console.log(`ETSY_REFRESH_TOKEN=${tokens.refresh_token}`);
      if (shopId) console.log(`ETSY_SHOP_ID=${shopId}`);
      else console.log("ETSY_SHOP_ID=  # could not auto-detect; get from Shop Manager URL or API");
      console.log("\nKeep ETSY_API_KEY and ETSY_SHARED_SECRET as already set.\n");

      res.writeHead(200, { "Content-Type": "text/html" });
      res.end(
        "<h2>Etsy auth complete</h2><p>You can close this tab and return to Cursor. Tokens were printed in the terminal.</p>"
      );
      server.close();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "unknown error";
      console.error("Failed:", msg);
      res.writeHead(500, { "Content-Type": "text/plain" });
      res.end(msg);
      server.close();
    }
  });

  server.listen(3456);
}

void main();
