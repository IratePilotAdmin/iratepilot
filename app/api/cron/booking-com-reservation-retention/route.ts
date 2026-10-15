import { NextResponse } from "next/server";
import { runBookingComReservationRetention } from "@/lib/booking-com-reservation-retention";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || request.headers.get("authorization") !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401, headers: { "Cache-Control": "no-store" } });
  }
  if (process.env.IRP_BOOKING_COM_RESERVATION_RETENTION_ENABLED !== "true") {
    return NextResponse.json({ ok: true, disabled: true }, { headers: { "Cache-Control": "no-store" } });
  }
  try {
    const result = await runBookingComReservationRetention(50);
    return NextResponse.json({ ok: true, ...result }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "Booking.com reservation retention is unavailable." }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}

export async function POST() {
  return NextResponse.json({ error: "Method not allowed." }, { status: 405, headers: { Allow: "GET", "Cache-Control": "no-store" } });
}
