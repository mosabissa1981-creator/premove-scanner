export const onRequestGet: PagesFunction = async () => {
  return new Response(JSON.stringify({ ok: true, host: "cloudflare-pages" }), {
    status: 200,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Access-Control-Allow-Origin": "*",
    },
  });
};
