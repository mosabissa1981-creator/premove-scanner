/**
 * Turn a raw API/network error string into a short, user-friendly message.
 *
 * Unusual Whales errors often arrive as a JSON string (e.g.
 * `{"code":"authentication_required","message":"..."}`) with embedded
 * newlines, which looks broken when shown verbatim. This extracts the
 * meaningful text, collapses whitespace, and maps auth failures to a clear
 * "check your key" message.
 */
export function cleanErrorMessage(raw: string): string {
  let text = (raw ?? "").trim();

  try {
    const parsed = JSON.parse(text);
    if (parsed && typeof parsed === "object" && "message" in parsed) {
      text = String((parsed as { message: unknown }).message ?? text);
    }
  } catch {
    // Not JSON — use the string as-is.
  }

  text = text.replace(/\s+/g, " ").trim();

  if (/rate.?limit|too many requests|429/i.test(text)) {
    return "Unusual Whales rate limit hit (per-minute cap). Wait a minute and retry — unlimited daily plans still have burst limits.";
  }

  if (/auth|token|unauthor|api[-\s]?key/i.test(text)) {
    return "Your Unusual Whales API key is missing or invalid. Add a valid key in Settings.";
  }

  if (!text) return "Something went wrong. Please try again.";

  return text.length > 180 ? `${text.slice(0, 180)}…` : text;
}
