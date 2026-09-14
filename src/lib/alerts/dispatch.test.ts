import { afterEach, describe, expect, it, vi } from "vitest";
import { dispatchAlert } from "@/lib/alerts/dispatch";

vi.mock("@/lib/alerts/telegram", () => ({
  sendTelegramAlert: vi.fn(async () => ({ ok: true })),
}));

vi.mock("@/lib/alerts/web-push-server", () => ({
  sendWebPushAlert: vi.fn(async () => ({ ok: true })),
}));

import { sendTelegramAlert } from "@/lib/alerts/telegram";
import { sendWebPushAlert } from "@/lib/alerts/web-push-server";

afterEach(() => {
  vi.clearAllMocks();
});

describe("dispatchAlert", () => {
  const event = {
    kind: "ready" as const,
    ticker: "AMZN",
    title: "Ready setup: AMZN",
    body: "test",
    url: "/ticker/AMZN",
  };

  it("sends to both channels when enabled", async () => {
    const result = await dispatchAlert({
      prefs: {
        webPush: { enabled: true },
        telegram: { enabled: true, botToken: "tok", chatId: "1" },
      },
      event,
      pushSubscription: {
        endpoint: "https://example.com/push",
        keys: { p256dh: "a", auth: "b" },
      },
    });
    expect(result.sent).toBe(true);
    expect(sendTelegramAlert).toHaveBeenCalledOnce();
    expect(sendWebPushAlert).toHaveBeenCalledOnce();
  });

  it("skips channels that are disabled", async () => {
    const result = await dispatchAlert({
      prefs: {
        webPush: { enabled: false },
        telegram: { enabled: false, botToken: "", chatId: "" },
      },
      event,
      pushSubscription: null,
    });
    expect(result.sent).toBe(false);
    expect(sendTelegramAlert).not.toHaveBeenCalled();
    expect(sendWebPushAlert).not.toHaveBeenCalled();
  });
});
