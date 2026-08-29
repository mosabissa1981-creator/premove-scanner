import { buildSectorsPayload } from "../shared/sectors";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Content-Type": "application/json; charset=utf-8",
};

export interface Env {
  ASSETS: Fetcher;
  VAPID_PUBLIC_KEY?: string;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const { pathname } = url;

    if (pathname === "/api/health" && request.method === "GET") {
      return Response.json({ ok: true, host: "cloudflare-pages" }, { headers: cors });
    }

    if (pathname === "/api/sectors" && request.method === "GET") {
      try {
        const bust = url.searchParams.has("t");
        const payload = await buildSectorsPayload();
        return Response.json(
          { ...payload, cached: !bust },
          {
            headers: {
              ...cors,
              "Cache-Control": "public, max-age=30",
            },
          },
        );
      } catch (err) {
        return Response.json(
          {
            error: "Failed to load sector heat",
            detail: err instanceof Error ? err.message : "Unknown error",
          },
          { status: 500, headers: cors },
        );
      }
    }

    if (pathname === "/api/push/vapid" && request.method === "GET") {
      const publicKey =
        env.VAPID_PUBLIC_KEY ??
        "BHxP7XHlYnxzPt6Zjiu8aNV2lcJmmAMTlRWPWq3z4K-lFUO7eDmx9SXdLJP5S2pY7AwixHRlKnbFsSb-cILAoCY";

      return Response.json({ publicKey, standaloneRequired: true }, { headers: cors });
    }

    if (
      (pathname === "/api/push/subscribe" || pathname === "/api/push/unsubscribe") &&
      request.method === "POST"
    ) {
      return Response.json({ ok: true }, { headers: cors });
    }

    return env.ASSETS.fetch(request);
  },
};
