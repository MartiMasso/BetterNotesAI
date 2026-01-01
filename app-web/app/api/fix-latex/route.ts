export const runtime = "nodejs";

function getApiBaseUrl() {
  const baseUrl = (process.env.API_BASE_URL ?? "").replace(/\/$/, "");
  return baseUrl;
}

export async function POST(req: Request) {
  const baseUrl = getApiBaseUrl();
  if (!baseUrl) {
    return new Response(JSON.stringify({ error: "API_BASE_URL is not set." }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  const body = await req.text();
  const contentType = req.headers.get("content-type") ?? "application/json";

  const upstream = await fetch(`${baseUrl}/fix-latex`, {
    method: "POST",
    headers: { "Content-Type": contentType },
    body,
  });

  const responseBody = await upstream.text();
  const responseContentType = upstream.headers.get("content-type") ?? "application/json";

  return new Response(responseBody, {
    status: upstream.status,
    headers: { "Content-Type": responseContentType },
  });
}
