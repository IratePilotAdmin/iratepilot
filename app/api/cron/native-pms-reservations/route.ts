import { NextResponse } from "next/server";
import { drainNativePmsReservationDelivery } from "@/lib/native-pms-reservation-delivery";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 180;

function failureCode(error: unknown): string {
  const message = error instanceof Error ? error.message : "";
  if (message === "Reservation worker database credential is invalid.") return "source_credential_invalid";
  if (message === "Reservation worker Supabase URL is invalid.") return "source_url_invalid";
  if (message === "Reservation credential encryption is unavailable.") return "encryption_key_invalid";
  if (message === "Reservation worker gateway URL is invalid.") return "gateway_url_invalid";
  if (message === "Reservation worker gateway credential is invalid.") return "gateway_credential_invalid";
  if (message === "Reservation worker database call failed: irp_pms_list_configured_delivery_connections.") return "source_connection_list_failed";
  if (message === "Reservation worker database call failed: irp_pms_claim_configured_event.") return "source_claim_failed";
  if (message === "Reservation worker database call failed: irp_pms_finish_event.") return "source_finish_failed";
  if (message === "Reservation worker connection registry is invalid.") return "source_connection_invalid";
  if (message === "Reservation worker claim response is invalid." || message === "Reservation worker claim row is invalid." || message === "Reservation worker event envelope is invalid.") return "source_claim_invalid";
  return "worker_unavailable";
}

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
    const results = await drainNativePmsReservationDelivery({
      supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
      serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY ?? "",
      credentialEncryptionKey,
      endpoint: destinationUrl,
      publishableKey: destinationPublishableKey,
    }, async (input, init) => fetch(input, init));
    const retryPending = results.some(({ outcome }) => outcome === "retry" || outcome === "lease_lost");
    return NextResponse.json({
      ok: !retryPending,
      outcomes: results.map(({ outcome, code }) => ({ outcome, code })),
    }, { status: retryPending ? 503 : 200, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const code = failureCode(error);
    console.error("Native PMS reservation cron failed:", code);
    return NextResponse.json({ error: "Reservation delivery worker is unavailable.", code }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}

export async function POST() {
  return NextResponse.json({ error: "Method not allowed." }, { status: 405, headers: { Allow: "GET", "Cache-Control": "no-store" } });
}
