import { buildSectorsPayload } from "../../shared/sectors";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Content-Type": "application/json; charset=utf-8",
  "Cache-Control": "public, max-age=30",
};

export const onRequestGet: PagesFunction = async (context) => {
  const url = new URL(context.request.url);
  const bust = url.searchParams.has("t");

  try {
    const payload = await buildSectorsPayload();
    return new Response(JSON.stringify({ ...payload, cached: !bust }), {
      status: 200,
      headers: cors,
    });
  } catch (err) {
    return new Response(
      JSON.stringify({
        error: "Failed to load sector heat",
        detail: err instanceof Error ? err.message : "Unknown error",
      }),
      { status: 500, headers: cors },
    );
  }
};
