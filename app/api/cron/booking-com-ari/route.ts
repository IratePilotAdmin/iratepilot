import { NextResponse } from "next/server";
import { runBookingComAriDelivery } from "@/lib/booking-com-ari-delivery";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || request.headers.get("authorization") !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401, headers: { "Cache-Control": "no-store" } });
  }
  if (process.env.IRP_BOOKING_COM_ARI_SYNC_ENABLED !== "true") {
    return NextResponse.json({ ok: true, disabled: true }, { headers: { "Cache-Control": "no-store" } });
  }
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY
    || !process.env.BOOKING_COM_CREDENTIAL_ENCRYPTION_KEY) {
    return NextResponse.json({ error: "Booking.com ARI delivery configuration is unavailable." }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
  try {
    const result = await runBookingComAriDelivery();
    return NextResponse.json({ ok: true, ...result }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "Booking.com ARI delivery worker is unavailable." }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}

export async function POST() {
  return NextResponse.json({ error: "Method not allowed." }, { status: 405, headers: { Allow: "GET", "Cache-Control": "no-store" } });
}
