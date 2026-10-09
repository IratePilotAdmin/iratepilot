import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/require-role";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  parseBookingComOnboardingInput,
  provisionBookingComTestConnection,
} from "@/services/hotel-channels/booking-com/onboarding";

export const dynamic = "force-dynamic";
const NO_STORE = { "Cache-Control": "private, no-store" };
const MAX_BODY_BYTES = 12_000;

async function approvedPartner(auth: Exclude<Awaited<ReturnType<typeof requireRole>>, { error: string; status: number }>) {
  const { data, error } = await auth.supabase.from("partners")
    .select("id,status").eq("owner_id", auth.user.id).maybeSingle();
  if (error) throw new Error("partner_lookup_failed");
  return data?.status === "approved" ? data : null;
}

export async function GET() {
  try {
    const auth = await requireRole(["partner"]);
    if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status, headers: NO_STORE });
    const partner = await approvedPartner(auth);
    if (!partner) return NextResponse.json({ error: "An approved partner account is required." }, { status: 403, headers: NO_STORE });

    const properties = await auth.supabase.from("properties").select("id,name,active").eq("partner_id", partner.id);
    if (properties.error) throw new Error("property_lookup_failed");
    const ids = (properties.data ?? []).map((property) => property.id);
    if (!ids.length) return NextResponse.json({ properties: properties.data ?? [], connections: [] }, { headers: NO_STORE });

    const { data, error } = await createAdminClient().from("irp_ota_channel_connections")
      .select("connection_id,property_id,provider_property_id,environment,enabled,partner_approved,pii_compliance_approved,updated_at")
      .eq("provider", "booking_com")
      .in("property_id", ids)
      .order("updated_at", { ascending: false });
    if (error?.code === "42P01") return NextResponse.json({ error: "Booking.com onboarding migration is not installed yet." }, { status: 503, headers: NO_STORE });
    if (error) throw new Error("connection_lookup_failed");
    return NextResponse.json({ properties: properties.data ?? [], connections: data ?? [] }, { headers: NO_STORE });
  } catch {
    return NextResponse.json({ error: "Booking.com connection status could not be loaded." }, { status: 503, headers: NO_STORE });
  }
}

export async function POST(request: Request) {
  const auth = await requireRole(["partner"]);
  if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status, headers: NO_STORE });
  let partner: Awaited<ReturnType<typeof approvedPartner>>;
  try {
    partner = await approvedPartner(auth);
  } catch {
    return NextResponse.json({ error: "Partner access could not be verified." }, { status: 503, headers: NO_STORE });
  }
  if (!partner) return NextResponse.json({ error: "An approved partner account is required." }, { status: 403, headers: NO_STORE });

  const contentLength = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(contentLength) && contentLength > MAX_BODY_BYTES) {
    return NextResponse.json({ error: "The onboarding request is too large." }, { status: 413, headers: NO_STORE });
  }
  let body: unknown;
  try {
    const raw = await request.text();
    if (new TextEncoder().encode(raw).byteLength > MAX_BODY_BYTES) {
      return NextResponse.json({ error: "The onboarding request is too large." }, { status: 413, headers: NO_STORE });
    }
    body = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "Send a valid JSON onboarding request." }, { status: 400, headers: NO_STORE });
  }
  const input = parseBookingComOnboardingInput(body);
  if (!input) return NextResponse.json({ error: "Enter valid Booking.com test account details." }, { status: 400, headers: NO_STORE });

  const property = await auth.supabase.from("properties").select("id,active")
    .eq("id", input.propertyId).eq("partner_id", partner.id).maybeSingle();
  if (property.error) return NextResponse.json({ error: "Property ownership could not be verified." }, { status: 503, headers: NO_STORE });
  if (!property.data || !property.data.active) return NextResponse.json({ error: "An active property in your account is required." }, { status: 404, headers: NO_STORE });

  try {
    const created = await provisionBookingComTestConnection(input);
    return NextResponse.json({
      connection: created,
      message: "Test credentials were encrypted and saved. Booking.com partner approval is still required; synchronization remains off.",
    }, { status: 201, headers: NO_STORE });
  } catch (error) {
    const code = error instanceof Error ? error.message : "";
    if (code === "booking_com_vault_migration_required") {
      return NextResponse.json({ error: "The Booking.com onboarding database migration must be installed first." }, { status: 503, headers: NO_STORE });
    }
    if (code === "booking_com_credential_encryption_unavailable") {
      return NextResponse.json({ error: "Secure Booking.com credential storage is not configured." }, { status: 503, headers: NO_STORE });
    }
    return NextResponse.json({ error: "Booking.com test onboarding could not be saved." }, { status: 503, headers: NO_STORE });
  }
}
