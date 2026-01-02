import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const API_BASE_URL = process.env.API_BASE_URL;
    if (!API_BASE_URL) {
      return NextResponse.json({ error: "API_BASE_URL is not set." }, { status: 500 });
    }

    const body = await req.json();

    const r = await fetch(`${API_BASE_URL}/compile`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      cache: "no-store",
    });

    if (!r.ok) {
      // backend devuelve JSON con {error, log}
      const data = await r.json().catch(() => ({}));
      return NextResponse.json(data, { status: r.status });
    }

    // PDF passthrough
    const buf = Buffer.from(await r.arrayBuffer());
    return new NextResponse(buf, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": 'inline; filename="notes.pdf"',
      },
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Unknown error" }, { status: 500 });
  }
}
