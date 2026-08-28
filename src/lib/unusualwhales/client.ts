const BASE_URL = "https://api.unusualwhales.com";

export class UnusualWhalesError extends Error {
  constructor(
    message: string,
    public status?: number,
  ) {
    super(message);
    this.name = "UnusualWhalesError";
  }
}

export class UnusualWhalesClient {
  constructor(private readonly apiKey: string) {}

  private async get<T>(path: string, params: Record<string, string | number | boolean | undefined> = {}): Promise<T> {
    const url = new URL(`${BASE_URL}${path}`);
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== "") {
        url.searchParams.set(key, String(value));
      }
    }

    const response = await fetch(url.toString(), {
      method: "GET",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        Accept: "application/json",
      },
      cache: "no-store",
    });

    if (!response.ok) {
      const text = await response.text();
      throw new UnusualWhalesError(
        text || `Unusual Whales API error (${response.status})`,
        response.status,
      );
    }

    return response.json() as Promise<T>;
  }

  stockScreener(params: Record<string, string | number | boolean | undefined> = {}) {
    return this.get("/api/screener/stocks", params);
  }

  flowAlerts(params: Record<string, string | number | boolean | undefined> = {}) {
    return this.get("/api/option-trades/flow-alerts", params);
  }

  tickerFlowAlerts(ticker: string, limit = 25) {
    return this.get(`/api/stock/${ticker}/flow-alerts`, { limit });
  }

  gexLevels(ticker: string) {
    return this.get(`/api/stock/${ticker}/gex-levels`);
  }

  darkpool(ticker: string, days = 5) {
    const newerThan = new Date();
    newerThan.setDate(newerThan.getDate() - days);
    return this.get(`/api/darkpool/${ticker}`, {
      newer_than: newerThan.toISOString(),
      limit: 500,
    });
  }

  ohlc(ticker: string, candleSize: "1d" = "1d", limit = 30) {
    return this.get(`/api/stock/${ticker}/ohlc/${candleSize}`, {
      limit,
      timeframe: "1m",
    });
  }

  ivRank(ticker: string) {
    return this.get(`/api/stock/${ticker}/iv-rank`, { timespan: "1y" });
  }

  optionsVolume(ticker: string) {
    return this.get(`/api/stock/${ticker}/options-volume`, { limit: 1 });
  }

  stockInfo(ticker: string) {
    return this.get(`/api/stock/${ticker}/info`);
  }
}

export function resolveApiKey(headerKey?: string | null): string | null {
  return headerKey?.trim() || process.env.UNUSUAL_WHALES_API_KEY?.trim() || null;
}
