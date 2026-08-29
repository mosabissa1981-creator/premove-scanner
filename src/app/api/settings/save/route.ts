import { NextResponse } from "next/server";
import { isSecureOrigin, normalizeApiKey, setApiKeyCookie } from "@/lib/api-key-cookie";
import { getRequestOrigin } from "@/lib/request-origin";

function wantsJson(request: Request): boolean {
  const contentType = request.headers.get("content-type") ?? "";
  return contentType.includes("application/json");
}

export async function POST(request: Request) {
  const origin = getRequestOrigin(request);
  const json = wantsJson(request);

  let rawKey = "";
  try {
    if (json) {
      const body = (await request.json()) as { apiKey?: string };
      rawKey = body.apiKey ?? "";
    } else {
      const formData = await request.formData();
      rawKey = formData.get("apiKey")?.toString() ?? "";
    }
  } catch {
    if (json) {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }
    return NextResponse.redirect(new URL("/settings?error=invalid", origin));
  }

  const apiKey = normalizeApiKey(rawKey);

  if (!apiKey) {
    if (json) {
      return NextResponse.json({ error: "API key is empty" }, { status: 400 });
    }
    return NextResponse.redirect(new URL("/settings?error=empty", origin));
  }

  if (apiKey.length < 20) {
    if (json) {
      return NextResponse.json(
        { error: `API key too short (${apiKey.length} chars)` },
        { status: 400 },
      );
    }
    return NextResponse.redirect(
      new URL(`/settings?error=short&len=${apiKey.length}`, origin),
    );
  }

  const cookieOptions = { secure: isSecureOrigin(origin) };

  if (json) {
    const response = NextResponse.json({ ok: true, message: "API key saved" });
    setApiKeyCookie(response, apiKey, cookieOptions);
    return response;
  }

  const response = NextResponse.redirect(new URL("/settings?saved=1", origin));
  setApiKeyCookie(response, apiKey, cookieOptions);
  return response;
}
