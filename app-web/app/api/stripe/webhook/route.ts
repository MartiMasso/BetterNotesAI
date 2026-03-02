import { processStripeWebhook } from "@/lib/server/stripeBilling";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const sig = req.headers.get("stripe-signature");
    if (!sig) {
      return new Response("Missing stripe-signature", { status: 400 });
    }

    const rawBody = await req.text();
    const result = await processStripeWebhook(rawBody, sig);
    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (e: any) {
    const status = Number(e?.statusCode ?? 500);
    console.error("[api/stripe/webhook]", {
      message: e?.message ?? "Unknown error",
      source: e?.source,
      operation: e?.operation,
      supabase: e?.supabase,
      type: e?.type,
      code: e?.code,
      statusCode: e?.statusCode,
      requestId: e?.requestId,
      raw: e?.raw,
    });
    return new Response(JSON.stringify({ error: e?.message ?? "Webhook handler failed" }), {
      status,
      headers: { "Content-Type": "application/json" },
    });
  }
}
