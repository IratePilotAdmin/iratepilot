import { NextResponse } from "next/server";
import { runNativePmsReservationDelivery } from "@/lib/native-pms-reservation-delivery";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || request.headers.get("authorization") !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401, headers: { "Cache-Control": "no-store" } });
  }
  if (process.env.IRP_PMS_SYNC_ENABLED !== "true") {
    return NextResponse.json({ ok: true, disabled: true }, { headers: { "Cache-Control": "no-store" } });
  }
  const credentialEncryptionKey = process.env.PMS_CREDENTIAL_ENCRYPTION_KEY;
  const destinationUrl = process.env.IRP_PMS_DESTINATION_URL;
  const destinationPublishableKey = process.env.IRP_PMS_DESTINATION_PUBLISHABLE_KEY;
  if (!credentialEncryptionKey || !destinationUrl || !destinationPublishableKey) {
    return NextResponse.json({ error: "Reservation delivery configuration is unavailable." }, { status: 503 });
  }

  try {
    const result = await runNativePmsReservationDelivery({
      supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
      serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY ?? "",
      credentialEncryptionKey,
      endpoint: destinationUrl,
      publishableKey: destinationPublishableKey,
    }, async (input, init) => fetch(input, init));
    return NextResponse.json({ ok: true, ...result }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "Reservation delivery worker is unavailable." }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}

export async function POST() {
  return NextResponse.json({ error: "Method not allowed." }, { status: 405, headers: { Allow: "GET", "Cache-Control": "no-store" } });
}
