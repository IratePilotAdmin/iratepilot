import { NextResponse } from "next/server";
import { runBookingComReservationImport } from "@/lib/booking-com-reservation-import";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || request.headers.get("authorization") !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401, headers: { "Cache-Control": "no-store" } });
  }
  if (process.env.IRP_BOOKING_COM_PMS_IMPORT_ENABLED !== "true") {
    return NextResponse.json({ ok: true, disabled: true }, { headers: { "Cache-Control": "no-store" } });
  }
  const config = {
    supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
    serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY ?? "",
    credentialEncryptionKey: process.env.BOOKING_COM_CREDENTIAL_ENCRYPTION_KEY ?? "",
    reservationEncryptionKey: process.env.OTA_RESERVATION_PII_ENCRYPTION_KEY ?? "",
    destinationUrl: process.env.IRP_PMS_DESTINATION_URL ?? "",
    destinationPublishableKey: process.env.IRP_PMS_DESTINATION_PUBLISHABLE_KEY ?? "",
    hotelFeesEnabled: process.env.IRP_PMS_OTA_HOTEL_FEES_ENABLED === "true",
  };
  if (!config.supabaseUrl || !config.serviceRoleKey || !config.credentialEncryptionKey
    || !config.reservationEncryptionKey || !config.destinationUrl || !config.destinationPublishableKey) {
    return NextResponse.json({ error: "Booking.com PMS import configuration is unavailable." }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
  try {
    const result = await runBookingComReservationImport(config);
    return NextResponse.json({ ok: true, ...result }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "Booking.com PMS import worker is unavailable." }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}

export async function POST() {
  return NextResponse.json({ error: "Method not allowed." }, { status: 405, headers: { Allow: "GET", "Cache-Control": "no-store" } });
}
