import type { Response } from "express";
import jwt, { type SignOptions } from "jsonwebtoken";

export const AUTH_COOKIE_NAME = "sarveda_auth";

export type JwtUserPayload = {
  sub: string;
  email: string;
  role: string;
};

const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;

function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error("JWT_SECRET must be set and at least 32 characters");
  }
  return secret;
}

export function signAccessToken(payload: JwtUserPayload): string {
  const options: SignOptions = {
    // jsonwebtoken typings require a narrow type for string durations
    expiresIn: (process.env.JWT_EXPIRES_IN ?? "7d") as NonNullable<SignOptions["expiresIn"]>
  };
  return jwt.sign(
    {
      sub: payload.sub,
      email: payload.email,
      role: payload.role
    },
    getJwtSecret(),
    options
  );
}

export function verifyAccessToken(token: string): JwtUserPayload {
  const decoded = jwt.verify(token, getJwtSecret()) as JwtUserPayload & { sub?: string };
  const sub = decoded.sub;
  const email = decoded.email;
  const role = typeof decoded.role === "string" ? decoded.role : "CUSTOMER";
  if (!sub || !email) {
    throw new Error("Invalid token payload");
  }
  return { sub, email, role };
}

export function cookieOptions(): {
  httpOnly: boolean;
  secure: boolean;
  sameSite: "lax";
  path: string;
  maxAge: number;
  expires: Date;
} {
  const prod = process.env.NODE_ENV === "production";
  const expires = new Date(Date.now() + sevenDaysMs);
  return {
    httpOnly: true,
    secure: prod,
    // Lax + explicit expiry so the session survives browser restarts (not incognito).
    sameSite: "lax",
    path: "/",
    maxAge: sevenDaysMs,
    expires
  };
}

export function setAuthCookie(res: Response, payload: JwtUserPayload): void {
  const token = signAccessToken(payload);
  res.cookie(AUTH_COOKIE_NAME, token, cookieOptions());
}

export function clearAuthCookie(res: Response): void {
  res.clearCookie(AUTH_COOKIE_NAME, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/"
  });
}
