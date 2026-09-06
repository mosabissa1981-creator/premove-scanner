import { NextResponse } from "next/server";
import { getRequestOrigin } from "@/lib/request-origin";

/**
 * POST → settings page redirect.
 * Uses 303 See Other so mobile browsers convert the navigation to GET
 * (307 Temporary Redirect after form POST often leaves a blank white page).
 * Prefers a same-origin absolute URL; falls back to a relative Location.
 */
export function redirectToSettings(
  request: Request,
  query: Record<string, string>,
): NextResponse {
  const params = new URLSearchParams(query);
  const path = `/settings?${params.toString()}`;

  try {
    const origin = getRequestOrigin(request);
    return NextResponse.redirect(new URL(path, origin), 303);
  } catch {
    return new NextResponse(null, {
      status: 303,
      headers: { Location: path },
    });
  }
}

export function requestIsHttps(request: Request): boolean {
  const forwardedProto = request.headers.get("x-forwarded-proto");
  if (forwardedProto) {
    return forwardedProto.split(",")[0]?.trim().toLowerCase() === "https";
  }
  try {
    return new URL(request.url).protocol === "https:";
  } catch {
    return true;
  }
}
