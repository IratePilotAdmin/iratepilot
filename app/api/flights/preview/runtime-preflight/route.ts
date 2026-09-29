import { NextResponse } from "next/server";

import { requireRole } from "@/lib/auth/require-role";
import { inspectFlightConsumerPreviewPreflight } from "@/lib/flights/consumer-preview/preflight.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function GET() {
  if (process.env.VERCEL_ENV !== "preview") {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }
  const auth = await requireRole(["admin"]);
  if ("error" in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  try {
    return NextResponse.json(await inspectFlightConsumerPreviewPreflight(), {
      status: 200,
      headers: {
        "Cache-Control": "private, no-store",
        "Referrer-Policy": "no-referrer",
      },
    });
  } catch {
    return NextResponse.json({ error: "Consumer Preview preflight is unavailable." }, {
      status: 503,
      headers: { "Cache-Control": "private, no-store" },
    });
  }
}
