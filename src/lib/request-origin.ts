export function getRequestOrigin(request: Request): string {
  const forwardedHost = request.headers.get("x-forwarded-host");
  const forwardedProto = request.headers.get("x-forwarded-proto");

  if (forwardedHost) {
    const proto = forwardedProto ?? "https";
    return `${proto}://${forwardedHost}`;
  }

  const host = request.headers.get("host");
  if (host && host !== "0.0.0.0:3000") {
    const proto =
      forwardedProto ??
      (host.startsWith("localhost") || host.startsWith("127.0.0.1") ? "http" : "https");
    return `${proto}://${host}`;
  }

  const { origin, hostname } = new URL(request.url);
  if (hostname !== "0.0.0.0") {
    return origin;
  }

  return "http://localhost:3000";
}
