const BASE_URL = "https://api.unusualwhales.com";

// Required on every request per the Unusual Whales API contract.
// See https://unusualwhales.com/skill.md ("Client Header").
const CLIENT_API_ID = "100001";

const MAX_RETRIES = 3;
const BASE_BACKOFF_MS = 400;
const MAX_BACKOFF_MS = 8_000;
const REQUEST_TIMEOUT_MS = 20_000;
const MAX_CACHE_ENTRIES = 500;

export class UnusualWhalesError extends Error {
  constructor(
    message: string,
    public status?: number,
  ) {
    super(message);
    this.name = "UnusualWhalesError";
  }
}

interface CacheEntry {
  promise: Promise<unknown>;
  expires: number;
}

// Module-level cache shared across requests. Cached payloads are market data
// keyed by URL (not user), so sharing between callers is safe and desirable —
// it collapses the many duplicate reads a scan issues into a single upstream
// call and keeps us well under the per-minute rate limit.
const responseCache = new Map<string, CacheEntry>();

function pruneCache() {
  const now = Date.now();
  for (const [key, entry] of responseCache) {
    if (entry.expires <= now) responseCache.delete(key);
  }
  if (responseCache.size > MAX_CACHE_ENTRIES) {
    const excess = responseCache.size - MAX_CACHE_ENTRIES;
    let removed = 0;
    for (const key of responseCache.keys()) {
      if (removed >= excess) break;
      responseCache.delete(key);
      removed += 1;
    }
  }
}

/** Test-only: reset the shared response cache between test cases. */
export function resetUwClientCache() {
  responseCache.clear();
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function backoffMs(attempt: number, retryAfterHeader: string | null): number {
  const retryAfterSec = Number(retryAfterHeader);
  if (Number.isFinite(retryAfterSec) && retryAfterSec > 0) {
    return Math.min(MAX_BACKOFF_MS, retryAfterSec * 1000);
  }
  const exponential = BASE_BACKOFF_MS * 2 ** attempt;
  const jitter = Math.random() * BASE_BACKOFF_MS;
  return Math.min(MAX_BACKOFF_MS, exponential + jitter);
}

export class UnusualWhalesClient {
  constructor(private readonly apiKey: string) {}

  private buildUrl(
    path: string,
    params: Record<string, string | number | boolean | undefined>,
  ): string {
    const url = new URL(`${BASE_URL}${path}`);
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== "") {
        url.searchParams.set(key, String(value));
      }
    }
    return url.toString();
  }

  private async request<T>(url: string): Promise<T> {
    for (let attempt = 0; ; attempt += 1) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

      try {
        const response = await fetch(url, {
          method: "GET",
          headers: {
            Authorization: `Bearer ${this.apiKey}`,
            "UW-CLIENT-API-ID": CLIENT_API_ID,
            Accept: "application/json",
          },
          cache: "no-store",
          signal: controller.signal,
        });

        if (response.ok) {
          return (await response.json()) as T;
        }

        const retryable = response.status === 429 || response.status >= 500;
        if (retryable && attempt < MAX_RETRIES) {
          await sleep(backoffMs(attempt, response.headers.get("retry-after")));
          continue;
        }

        const text = await response.text();
        throw new UnusualWhalesError(
          text || `Unusual Whales API error (${response.status})`,
          response.status,
        );
      } catch (err) {
        // Surface explicit API errors immediately; retry transient
        // network/abort/timeout failures with backoff.
        if (err instanceof UnusualWhalesError) throw err;
        if (attempt >= MAX_RETRIES) {
          throw new UnusualWhalesError(
            err instanceof Error ? err.message : "Request failed",
          );
        }
        await sleep(backoffMs(attempt, null));
      } finally {
        clearTimeout(timeout);
      }
    }
  }

  private get<T>(
    path: string,
    params: Record<string, string | number | boolean | undefined> = {},
    ttlMs = 0,
  ): Promise<T> {
    const url = this.buildUrl(path, params);

    if (ttlMs > 0) {
      const cached = responseCache.get(url);
      if (cached && cached.expires > Date.now()) {
        return cached.promise as Promise<T>;
      }
    }

    const promise = this.request<T>(url);

    if (ttlMs > 0) {
      responseCache.set(url, { promise, expires: Date.now() + ttlMs });
      pruneCache();
      // Never cache a failed response.
      promise.catch(() => {
        const entry = responseCache.get(url);
        if (entry && entry.promise === promise) responseCache.delete(url);
      });
    }

    return promise;
  }

  stockScreener(params: Record<string, string | number | boolean | undefined> = {}) {
    return this.get("/api/screener/stocks", params);
  }

  flowAlerts(params: Record<string, string | number | boolean | undefined> = {}) {
    return this.get("/api/option-trades/flow-alerts", params);
  }

  tickerFlowAlerts(ticker: string, limit = 25) {
    return this.get(`/api/stock/${ticker}/flow-alerts`, { limit }, 30_000);
  }

  gexLevels(ticker: string, source: "oi" | "vol" = "oi") {
    return this.get(`/api/stock/${ticker}/gex-levels`, { source }, 120_000);
  }

  greekExposureByExpiry(ticker: string) {
    return this.get(`/api/stock/${ticker}/greek-exposure/expiry`, {}, 120_000);
  }

  greekExposureByStrike(ticker: string) {
    return this.get(`/api/stock/${ticker}/greek-exposure/strike`, {}, 120_000);
  }

  greekExposureByStrikeExpiry(ticker: string, expiry: string) {
    return this.get(`/api/stock/${ticker}/greek-exposure/strike-expiry`, { expiry }, 120_000);
  }

  spotExposureByStrike(
    ticker: string,
    params: { minStrike?: number; maxStrike?: number; page?: number; limit?: number } = {},
  ) {
    return this.get(`/api/stock/${ticker}/spot-exposures/strike`, {
      min_strike: params.minStrike,
      max_strike: params.maxStrike,
      page: params.page,
      limit: params.limit ?? 500,
    }, 120_000);
  }

  spotExposureByExpiryStrike(ticker: string, expirations: string[]) {
    const url = new URL(`${BASE_URL}/api/stock/${ticker}/spot-exposures/expiry-strike`);
    for (const expiry of expirations) {
      url.searchParams.append("expirations[]", expiry);
    }
    url.searchParams.set("limit", "500");
    return this.request(url.toString());
  }

  darkpool(ticker: string, days = 5) {
    const newerThan = new Date();
    newerThan.setDate(newerThan.getDate() - days);
    return this.get(
      `/api/darkpool/${ticker}`,
      {
        newer_than: newerThan.toISOString(),
        limit: 500,
      },
      120_000,
    );
  }

  ohlc(ticker: string, candleSize: "1d" = "1d", limit = 30) {
    return this.get(`/api/stock/${ticker}/ohlc/${candleSize}`, { limit }, 300_000);
  }

  ivRank(ticker: string) {
    return this.get(`/api/stock/${ticker}/iv-rank`, { timespan: "1y" }, 600_000);
  }

  optionsVolume(ticker: string) {
    return this.get(`/api/stock/${ticker}/options-volume`, { limit: 1 }, 60_000);
  }

  stockInfo(ticker: string) {
    return this.get(`/api/stock/${ticker}/info`, {}, 86_400_000);
  }

  marketTide(params: Record<string, string | number | boolean | undefined> = {}) {
    return this.get("/api/market/market-tide", params, 120_000);
  }
}

export function resolveApiKey(headerKey?: string | null, cookieKey?: string | null): string | null {
  return (
    headerKey?.trim() ||
    cookieKey?.trim() ||
    process.env.UNUSUAL_WHALES_API_KEY?.trim() ||
    null
  );
}
