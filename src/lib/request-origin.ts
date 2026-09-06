export function getRequestOrigin(request: Request): string {
  const forwardedHost = request.headers.get("x-forwarded-host");
  const forwardedProto = request.headers.get("x-forwarded-proto");

  if (forwardedHost) {
    // Some proxies send a comma-separated list — use the first public host.
    const host = forwardedHost.split(",")[0]?.trim();
    const proto = (forwardedProto ?? "https").split(",")[0]?.trim() || "https";
    if (host) return `${proto}://${host}`;
  }

  const hostHeader = request.headers.get("host");
  if (hostHeader && !hostHeader.startsWith("0.0.0.0")) {
    const isLocal =
      hostHeader.startsWith("localhost") || hostHeader.startsWith("127.0.0.1");
    const proto =
      (forwardedProto ?? "").split(",")[0]?.trim() || (isLocal ? "http" : "https");
    return `${proto}://${hostHeader}`;
  }

  try {
    const url = new URL(request.url);
    if (url.hostname !== "0.0.0.0") {
      return url.origin;
    }
  } catch {
    // fall through
  }

  return "http://localhost:3000";
}
