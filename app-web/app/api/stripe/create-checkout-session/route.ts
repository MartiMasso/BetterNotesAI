import { createCheckoutSessionForUser } from "@/lib/server/stripeBilling";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const result = await createCheckoutSessionForUser(body ?? {});
    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (e: any) {
    console.error("[api/stripe/create-checkout-session]", {
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
    const status = Number(e?.statusCode ?? 500);
    return new Response(JSON.stringify({ ok: false, error: e?.message ?? "Server error" }), {
      status,
      headers: { "Content-Type": "application/json" },
    });
  }
}
