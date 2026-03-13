export const runtime = "nodejs";

function getApiBaseUrl() {
  return (process.env.API_BASE_URL ?? "").replace(/\/$/, "");
}

function jsonError(status: number, error: string) {
  return new Response(JSON.stringify({ error }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export async function POST(req: Request) {
  const baseUrl = getApiBaseUrl();
  if (!baseUrl) {
    return jsonError(500, "API_BASE_URL is not set.");
  }

  const body = await req.text();
  const contentType = req.headers.get("content-type") ?? "application/json";

  try {
    const upstream = await fetch(`${baseUrl}/generate-latex`, {
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
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown upstream error.";
    return jsonError(
      502,
      `Cannot reach app-api at ${baseUrl}. Check API_BASE_URL and ensure app-api is running. (${message})`
    );
  }
}
