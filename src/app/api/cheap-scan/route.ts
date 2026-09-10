import { NextResponse } from "next/server";

/** Legacy alias → Coil movers scan. */
export async function GET(request: Request) {
  const url = new URL(request.url);
  url.pathname = "/api/movers/scan";
  return NextResponse.redirect(url, 308);
}
