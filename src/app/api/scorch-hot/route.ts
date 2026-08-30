import { NextResponse } from "next/server";
import { buildSectorsPayload } from "@/lib/scorch-hot/sectors";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const bust = url.searchParams.has("t");

  try {
    const payload = await buildSectorsPayload();
    return NextResponse.json(
      { ...payload, cached: !bust },
      {
        headers: {
          "Cache-Control": "public, max-age=30",
        },
      },
    );
  } catch (err) {
    return NextResponse.json(
      {
        error: "Failed to load sector heat",
        detail: err instanceof Error ? err.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}
