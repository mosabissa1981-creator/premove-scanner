const BASE_URL = "https://api.quantdata.us";

export class QuantDataError extends Error {
  constructor(
    message: string,
    public status?: number,
  ) {
    super(message);
    this.name = "QuantDataError";
  }
}

export class QuantDataClient {
  constructor(private readonly apiKey: string) {}

  private async post<T>(path: string, body: Record<string, unknown> = {}): Promise<T> {
    const response = await fetch(`${BASE_URL}${path}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      cache: "no-store",
    });

    if (!response.ok) {
      const text = await response.text();
      throw new QuantDataError(
        text || `Quant Data API error (${response.status})`,
        response.status,
      );
    }

    return response.json() as Promise<T>;
  }

  gainersLosers(body: Record<string, unknown> = {}) {
    return this.post("/v1/options/tool/gainers-losers", body);
  }

  exposureByStrike(ticker: string) {
    return this.post("/v1/options/tool/exposure-by-strike", {
      greekMode: "GAMMA",
      representationMode: "RAW",
      filter: { ticker },
    });
  }

  darkFlow(ticker: string, days = 5) {
    const end = new Date();
    const start = new Date();
    start.setDate(start.getDate() - days);

    return this.post("/v1/equities/tool/dark-flow", {
      timeRange: {
        startTime: start.toISOString(),
        endTime: end.toISOString(),
      },
      aggregationPeriod: "1d",
      filter: { ticker },
    });
  }

  stockPriceOverTime(ticker: string, days = 30) {
    const end = new Date();
    const start = new Date();
    start.setDate(start.getDate() - days);

    return this.post("/v1/equities/tool/stock-price-over-time", {
      timeRange: {
        startTime: start.toISOString(),
        endTime: end.toISOString(),
      },
      aggregationPeriod: "1d",
      filter: { ticker },
    });
  }

  ivRank(ticker: string) {
    return this.post("/v1/options/tool/iv-rank", {
      filter: { ticker },
      lookBackPeriod: 30,
      maturity: 30,
    });
  }

  netFlow(ticker: string) {
    return this.post("/v1/options/tool/net-flow", {
      dataMode: "NET_PREMIUM",
      filter: { ticker },
    });
  }

  orderFlowConsolidated(ticker: string) {
    return this.post("/v1/options/tool/order-flow/consolidated", {
      filter: { ticker },
      size: 50,
      sort: "tradeTime DESCENDING",
    });
  }

  marketMap() {
    return this.post("/v1/equities/tool/market-map", {});
  }
}

export function resolveApiKey(headerKey?: string | null): string | null {
  return headerKey?.trim() || process.env.QUANTDATA_API_KEY?.trim() || null;
}
