import { NextResponse } from "next/server";
import { clearApiKeyCookie } from "@/lib/api-key-cookie";
import { getRequestOrigin } from "@/lib/request-origin";

export async function POST(request: Request) {
  const origin = getRequestOrigin(request);
  const response = NextResponse.redirect(new URL("/settings?cleared=1", origin));
  clearApiKeyCookie(response);
  return response;
}
