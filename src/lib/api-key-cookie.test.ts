import { describe, it, expect } from "vitest";
import { isSecureOrigin } from "@/lib/api-key-cookie";

describe("isSecureOrigin", () => {
  it("returns true for https origins", () => {
    expect(isSecureOrigin("https://premove.example.com")).toBe(true);
  });

  it("returns false for http origins", () => {
    expect(isSecureOrigin("http://localhost:3000")).toBe(false);
  });

  it("returns false for invalid origins", () => {
    expect(isSecureOrigin("not-a-url")).toBe(false);
  });
});
