import { describe, it, expect } from "vitest";
import { cleanErrorMessage } from "@/lib/format-error";

describe("cleanErrorMessage", () => {
  it("maps Unusual Whales auth errors to a friendly key message", () => {
    const raw = JSON.stringify({
      code: "authentication_required",
      message: "Your token Bearer xyz is not in the correct format.\nRead ...",
    });
    expect(cleanErrorMessage(raw)).toBe(
      "Your Unusual Whales API key is missing or invalid. Add a valid key in Settings.",
    );
  });

  it("extracts the message field from a JSON error and collapses whitespace", () => {
    const raw = JSON.stringify({ code: "rate_limited", message: "Too many\n\n requests" });
    expect(cleanErrorMessage(raw)).toBe("Too many requests");
  });

  it("returns a plain string message unchanged (trimmed)", () => {
    expect(cleanErrorMessage("  Scan failed  ")).toBe("Scan failed");
  });

  it("falls back for empty input", () => {
    expect(cleanErrorMessage("")).toBe("Something went wrong. Please try again.");
  });

  it("truncates very long messages", () => {
    const long = "x".repeat(300);
    const result = cleanErrorMessage(long);
    expect(result.endsWith("…")).toBe(true);
    expect(result.length).toBeLessThanOrEqual(181);
  });
});
