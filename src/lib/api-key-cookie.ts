import { NextResponse } from "next/server";

export const COOKIE_NAME = "uw_api_key";
export const COOKIE_MAX_AGE = 60 * 60 * 24 * 30; // 30 days

export function normalizeApiKey(raw: string): string {
  return raw.trim().replace(/^Bearer\s+/i, "");
}

export function isSecureOrigin(origin: string): boolean {
  try {
    return new URL(origin).protocol === "https:";
  } catch {
    return false;
  }
}

export function setApiKeyCookie(
  response: NextResponse,
  apiKey: string,
  options: { secure?: boolean } = {},
) {
  response.cookies.set(COOKIE_NAME, apiKey, {
    httpOnly: true,
    // Browsers reject Secure cookies on http:// — that made keys look "saved"
    // while the scanner still blocked access.
    secure: options.secure ?? true,
    sameSite: "lax",
    path: "/",
    maxAge: COOKIE_MAX_AGE,
  });
}

export function clearApiKeyCookie(response: NextResponse) {
  response.cookies.delete(COOKIE_NAME);
}
