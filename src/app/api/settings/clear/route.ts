import { clearApiKeyCookie } from "@/lib/api-key-cookie";
import { redirectToSettings } from "@/lib/settings-redirect";

export async function POST(request: Request) {
  const response = redirectToSettings(request, { cleared: "1" });
  clearApiKeyCookie(response);
  return response;
}
