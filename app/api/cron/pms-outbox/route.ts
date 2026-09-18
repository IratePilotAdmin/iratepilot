import { NextResponse } from "next/server";
import { drainNativePmsEvents } from "@/services/hotel-suppliers/iratepilot-pms/native-delivery";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function authorized(request: Request) {
  const secret = process.env.CRON_SECRET;
  return Boolean(secret) && request.headers.get("authorization") === `Bearer ${secret}`;
}

export async function GET(request: Request) {
  if (!authorized(request)) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  try {
    const results = await drainNativePmsEvents(25);
    return NextResponse.json({ ok: true, results }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Native PMS outbox delivery failed", error);
    return NextResponse.json({ error: "PMS delivery is temporarily unavailable." }, { status: 503 });
  }
}
