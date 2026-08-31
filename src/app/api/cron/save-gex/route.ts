import { NextResponse } from "next/server";
import { UnusualWhalesClient, resolveApiKey } from "@/lib/unusualwhales/client";
import { isDatabaseConfigured } from "@/lib/db/prisma";
import { saveDailyGexSnapshots } from "@/lib/cron/save-gex";

export const maxDuration = 300;

function authorizeCron(request: Request): boolean {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return process.env.NODE_ENV !== "production";

  const auth = request.headers.get("authorization");
  if (auth === `Bearer ${secret}`) return true;

  const headerSecret = request.headers.get("x-cron-secret");
  return headerSecret === secret;
}

export async function GET(request: Request) {
  if (!authorizeCron(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!isDatabaseConfigured()) {
    return NextResponse.json(
      { error: "DATABASE_URL is not configured." },
      { status: 503 },
    );
  }

  const apiKey = resolveApiKey(request.headers.get("x-uw-api-key"), null);
  if (!apiKey) {
    return NextResponse.json(
      { error: "UNUSUAL_WHALES_API_KEY is required for the GEX cron job." },
      { status: 401 },
    );
  }

  const { searchParams } = new URL(request.url);
  const limit = Number(searchParams.get("limit") ?? "25");
  const date = searchParams.get("date") ?? undefined;

  try {
    const client = new UnusualWhalesClient(apiKey);
    const result = await saveDailyGexSnapshots(client, {
      limit: Number.isFinite(limit) ? limit : 25,
      date,
    });
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Cron job failed" },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  return GET(request);
}
