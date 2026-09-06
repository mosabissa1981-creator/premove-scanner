import { NextResponse } from "next/server";

export const COOKIE_NAME = "uw_api_key";
export const COOKIE_MAX_AGE = 60 * 60 * 24 * 30; // 30 days

/** Strip paste noise and Bearer prefix; reject cookie-breaking characters. */
export function normalizeApiKey(raw: string): string {
  return raw
    .replace(/^\uFEFF/, "")
    .replace(/^Bearer\s+/i, "")
    .replace(/[\r\n\t\0\v\f]/g, "")
    .trim();
}

export function isCookieSafeApiKey(apiKey: string): boolean {
  // Set-Cookie values cannot contain semicolon/comma without breaking the header.
  return apiKey.length > 0 && !/[;,]/.test(apiKey);
}

export function setApiKeyCookie(
  response: NextResponse,
  apiKey: string,
  options?: { secure?: boolean },
) {
  const secure = options?.secure ?? true;
  response.cookies.set(COOKIE_NAME, apiKey, {
    httpOnly: true,
    secure,
    sameSite: "lax",
    path: "/",
    maxAge: COOKIE_MAX_AGE,
  });
}

export function clearApiKeyCookie(response: NextResponse) {
  response.cookies.set(COOKIE_NAME, "", {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
}
