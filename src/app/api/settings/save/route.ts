import { NextResponse } from "next/server";
import {
  isCookieSafeApiKey,
  normalizeApiKey,
  setApiKeyCookie,
} from "@/lib/api-key-cookie";
import { redirectToSettings, requestIsHttps } from "@/lib/settings-redirect";

function wantsJson(request: Request): boolean {
  const contentType = request.headers.get("content-type") ?? "";
  return contentType.includes("application/json");
}

export async function POST(request: Request) {
  const json = wantsJson(request);
  const secure = requestIsHttps(request);

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
    return redirectToSettings(request, { error: "invalid" });
  }

  const apiKey = normalizeApiKey(rawKey);

  if (!apiKey) {
    if (json) {
      return NextResponse.json({ error: "API key is empty" }, { status: 400 });
    }
    return redirectToSettings(request, { error: "empty" });
  }

  if (apiKey.length < 20) {
    if (json) {
      return NextResponse.json(
        { error: `API key too short (${apiKey.length} chars)` },
        { status: 400 },
      );
    }
    return redirectToSettings(request, {
      error: "short",
      len: String(apiKey.length),
    });
  }

  if (!isCookieSafeApiKey(apiKey)) {
    if (json) {
      return NextResponse.json(
        { error: "API key contains invalid characters" },
        { status: 400 },
      );
    }
    return redirectToSettings(request, { error: "invalid" });
  }

  if (json) {
    const response = NextResponse.json({ ok: true, message: "API key saved" });
    setApiKeyCookie(response, apiKey, { secure });
    return response;
  }

  // Form POST: 303 → GET /settings?saved=1 (avoids blank white page on mobile).
  const response = redirectToSettings(request, { saved: "1" });
  setApiKeyCookie(response, apiKey, { secure });
  return response;
}
