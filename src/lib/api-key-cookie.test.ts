import { describe, expect, it } from "vitest";
import {
  isCookieSafeApiKey,
  normalizeApiKey,
} from "@/lib/api-key-cookie";
import { getRequestOrigin } from "@/lib/request-origin";

describe("normalizeApiKey", () => {
  it("strips Bearer prefix, BOM, and paste whitespace", () => {
    expect(normalizeApiKey("\uFEFFBearer abcdefghijklmnopqrstuvwxyz\n")).toBe(
      "abcdefghijklmnopqrstuvwxyz",
    );
  });
});

describe("isCookieSafeApiKey", () => {
  it("rejects cookie-breaking characters", () => {
    expect(isCookieSafeApiKey("good-key-with-enough-chars")).toBe(true);
    expect(isCookieSafeApiKey("bad;key")).toBe(false);
    expect(isCookieSafeApiKey("bad,key")).toBe(false);
  });
});

describe("getRequestOrigin", () => {
  it("uses the first x-forwarded-host entry", () => {
    const request = new Request("http://0.0.0.0:3000/api/settings/save", {
      headers: {
        "x-forwarded-host": "premove.example.com, localhost:3000",
        "x-forwarded-proto": "https",
      },
    });
    expect(getRequestOrigin(request)).toBe("https://premove.example.com");
  });
});
