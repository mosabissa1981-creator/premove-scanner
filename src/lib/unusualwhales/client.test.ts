import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  UnusualWhalesClient,
  UnusualWhalesError,
  resetUwClientCache,
} from "@/lib/unusualwhales/client";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  resetUwClientCache();
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("UnusualWhalesClient requests", () => {
  it("sends the required auth and client-id headers", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ data: [] }));
    const client = new UnusualWhalesClient("secret-token");

    await client.stockScreener({ ticker: "SPY" });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toContain("/api/screener/stocks");
    const headers = init.headers as Record<string, string>;
    expect(headers.Authorization).toBe("Bearer secret-token");
    expect(headers["UW-CLIENT-API-ID"]).toBe("100001");
    expect(headers.Accept).toBe("application/json");
  });

  it("caches responses for endpoints with a TTL", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ data: { gamma_flip: "1" } }));
    const client = new UnusualWhalesClient("k");

    await client.gexLevels("AAPL");
    await client.gexLevels("AAPL");

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("does not cache endpoints requested fresh", async () => {
    fetchMock.mockImplementation(async () => jsonResponse({ data: [] }));
    const client = new UnusualWhalesClient("k");

    await client.stockScreener();
    await client.stockScreener();

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("retries on 429 then succeeds", async () => {
    fetchMock
      .mockResolvedValueOnce(new Response("rate limited", { status: 429 }))
      .mockResolvedValueOnce(jsonResponse({ data: "ok" }));
    const client = new UnusualWhalesClient("k");

    const result = (await client.stockScreener()) as { data: string };

    expect(result.data).toBe("ok");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("throws a typed error on a non-retryable status", async () => {
    fetchMock.mockImplementation(async () => new Response("bad key", { status: 401 }));
    const client = new UnusualWhalesClient("k");

    await expect(client.stockScreener()).rejects.toBeInstanceOf(UnusualWhalesError);
    await expect(client.stockScreener()).rejects.toMatchObject({ status: 401 });
    expect(fetchMock).toHaveBeenCalledTimes(2); // one per assertion, no retries
  });
});
