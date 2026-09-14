import { NextResponse } from "next/server";
import { getVapidConfig } from "@/lib/alerts/web-push-server";

export async function GET() {
  const vapid = getVapidConfig();
  if (!vapid) {
    return NextResponse.json(
      {
        configured: false,
        publicKey: null,
        error:
          "VAPID keys not configured. Set VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY on the server.",
      },
      { status: 200 },
    );
  }
  return NextResponse.json({
    configured: true,
    publicKey: vapid.publicKey,
  });
}
