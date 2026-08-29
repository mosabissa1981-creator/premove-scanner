export const onRequestGet: PagesFunction = async (context) => {
  const publicKey =
    context.env.VAPID_PUBLIC_KEY ??
    "BHxP7XHlYnxzPt6Zjiu8aNV2lcJmmAMTlRWPWq3z4K-lFUO7eDmx9SXdLJP5S2pY7AwixHRlKnbFsSb-cILAoCY";

  return new Response(JSON.stringify({ publicKey, standaloneRequired: true }), {
    status: 200,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Access-Control-Allow-Origin": "*",
    },
  });
};
