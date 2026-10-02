import { NextResponse } from "next/server";
import { runBookingComCredentialRotation } from "@/lib/booking-com-credential-rotation";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || request.headers.get("authorization") !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401, headers: { "Cache-Control": "no-store" } });
  }
  if (process.env.IRP_BOOKING_COM_CREDENTIAL_ROTATION_ENABLED !== "true") {
    return NextResponse.json({ ok: true, disabled: true }, { headers: { "Cache-Control": "no-store" } });
  }
  const configuredVersion = process.env.BOOKING_COM_CREDENTIAL_ENCRYPTION_ACTIVE_KEY_VERSION ?? "1";
  if (configuredVersion !== "1" && configuredVersion !== "2") {
    return NextResponse.json({ error: "Credential rotation configuration is unavailable." }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
  try {
    const result = await runBookingComCredentialRotation({
      targetKeyVersion: Number(configuredVersion) as 1 | 2,
      limit: 10,
    });
    return NextResponse.json({ ok: true, ...result }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "Booking.com credential rotation is unavailable." }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}

export async function POST() {
  return NextResponse.json({ error: "Method not allowed." }, { status: 405, headers: { Allow: "GET", "Cache-Control": "no-store" } });
}
