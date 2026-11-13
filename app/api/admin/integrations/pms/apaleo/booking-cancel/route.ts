import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/require-role";
import { decryptPmsCredentials, encryptPmsCredentials } from "@/lib/integrations/pms-credentials";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  ApaleoAdapter,
  ApaleoBookingMapper,
  ApaleoConnectionTestError,
  ApaleoHttpTransport,
  ApaleoTransportError,
  listApaleoProperties,
} from "@/services/hotel-suppliers/apaleo";

export const dynamic = "force-dynamic";

type TestBody = {
  connectionId?: unknown;
  arrivalDate?: unknown;
  departureDate?: unknown;
  adults?: unknown;
};

function dateValue(value: unknown) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value ? null : date;
}

function validation(body: TestBody | null) {
  const connectionId = typeof body?.connectionId === "string" ? body.connectionId.trim() : "";
  const arrival = dateValue(body?.arrivalDate);
  const departure = dateValue(body?.departureDate);
  const adults = typeof body?.adults === "number" ? body.adults : Number.NaN;
  if (!connectionId || connectionId.length > 100 || !arrival || !departure || !Number.isInteger(adults)) return null;
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  const nights = Math.round((departure.getTime() - arrival.getTime()) / 86_400_000);
  const advanceDays = Math.round((arrival.getTime() - today.getTime()) / 86_400_000);
  if (advanceDays < 0 || advanceDays > 365 || nights < 1 || nights > 30 || adults < 1 || adults > 8) return null;
  return {
    connectionId,
    arrivalDate: arrival.toISOString().slice(0, 10),
    departureDate: departure.toISOString().slice(0, 10),
    adults,
  };
}

type ApaleoLaunchEvidence = {
  vendor_approved?: boolean | null;
  approved_environment?: string | null;
  property_code?: string | null;
  verification_notes?: string | null;
};

function isApprovedApaleoTestProperty(evidence: ApaleoLaunchEvidence | null, propertyCode: string) {
  if (!evidence?.vendor_approved) return false;
  const environment = evidence.approved_environment?.trim().toLowerCase() ?? "";
  const recordedProperty = evidence.property_code?.trim() ?? "";
  const notes = evidence.verification_notes?.trim().toLowerCase() ?? "";
  const recordedCode = recordedProperty.split(/[\s(]/, 1)[0]?.toUpperCase();
  const testMarker = /\b(sandbox|test|developer)\b/;
  return testMarker.test(environment)
    && recordedCode === propertyCode.trim().toUpperCase()
    && testMarker.test(`${recordedProperty.toLowerCase()} ${notes}`);
}

function handledError(error: unknown) {
  if (error instanceof ApaleoConnectionTestError || error instanceof ApaleoTransportError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }
  console.error("Apaleo sandbox booking/cancellation test failed", {
    name: error instanceof Error ? error.name : "UnknownError",
    message: error instanceof Error ? error.message : "Unknown error",
  });
  return NextResponse.json({ error: "The Apaleo sandbox booking test could not be completed." }, { status: 503 });
}

export async function POST(request: Request) {
  const auth = await requireRole(["admin"]);
  if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const input = validation(await request.json().catch(() => null) as TestBody | null);
  if (!input) {
    return NextResponse.json({
      error: "Choose valid dates within the next year for a 1–30 night stay and 1–8 adults.",
    }, { status: 400 });
  }

  try {
    const admin = createAdminClient();
    const [connection, stored, evidence] = await Promise.all([
      admin.from("property_pms_connections")
        .select("id,provider_id,external_property_code")
        .eq("id", input.connectionId)
        .maybeSingle(),
      admin.from("property_pms_credentials")
        .select("ciphertext,initialization_vector,authentication_tag,key_version")
        .eq("connection_id", input.connectionId)
        .maybeSingle(),
      admin.from("priority_pms_launch_evidence")
        .select("vendor_approved,approved_environment,property_code,verification_notes")
        .eq("provider_id", "apaleo")
        .maybeSingle(),
    ]);
    if (connection.error) throw connection.error;
    if (stored.error) throw stored.error;
    if (evidence.error) throw evidence.error;
    if (!connection.data || connection.data.provider_id !== "apaleo") {
      return NextResponse.json({ error: "Apaleo connection not found." }, { status: 404 });
    }
    const propertyCode = connection.data.external_property_code;
    if (!propertyCode) {
      return NextResponse.json({ error: "Select an authorized Apaleo property first." }, { status: 409 });
    }
    if (!stored.data) {
      return NextResponse.json({ error: "Store the Apaleo credentials first." }, { status: 409 });
    }
    if (!isApprovedApaleoTestProperty(evidence.data, propertyCode)) {
      return NextResponse.json({
        error: "Record the vendor-approved Apaleo test environment and this exact sandbox property before running a booking test.",
      }, { status: 409 });
    }

    const credentials = decryptPmsCredentials({
      ciphertext: stored.data.ciphertext,
      initializationVector: stored.data.initialization_vector,
      authenticationTag: stored.data.authentication_tag,
      keyVersion: stored.data.key_version,
    });
    const clientId = credentials.PMS_APALEO_CLIENT_ID?.trim();
    const clientSecret = credentials.PMS_APALEO_CLIENT_SECRET?.trim();
    if (!clientId || !clientSecret) {
      return NextResponse.json({ error: "Apaleo client credentials are incomplete." }, { status: 409 });
    }

    const authorization = await listApaleoProperties({
      baseUrl: credentials.PMS_APALEO_BASE_URL,
      clientId,
      clientSecret,
      refreshToken: credentials.PMS_APALEO_REFRESH_TOKEN,
    });
    if (!authorization.properties.some((property) => property.id === propertyCode)) {
      return NextResponse.json({
        error: "The selected property is no longer authorized for this Apaleo account.",
      }, { status: 409 });
    }
    if (authorization.refreshToken && authorization.refreshToken !== credentials.PMS_APALEO_REFRESH_TOKEN) {
      const encrypted = encryptPmsCredentials({
        ...credentials,
        PMS_APALEO_REFRESH_TOKEN: authorization.refreshToken,
      });
      const updated = await admin.from("property_pms_credentials").update({
        ciphertext: encrypted.ciphertext,
        initialization_vector: encrypted.initializationVector,
        authentication_tag: encrypted.authenticationTag,
        key_version: encrypted.keyVersion,
        configured_by: auth.user.id,
        updated_at: new Date().toISOString(),
      }).eq("connection_id", input.connectionId);
      if (updated.error) throw updated.error;
    }

    const adapter = new ApaleoAdapter(
      new ApaleoHttpTransport({
        baseUrl: credentials.PMS_APALEO_BASE_URL,
        accessToken: authorization.accessToken,
      }),
      new ApaleoBookingMapper(),
    );
    const offers = await adapter.availability({
      propertyCode,
      arrivalDate: input.arrivalDate,
      departureDate: input.departureDate,
      adults: input.adults,
      rooms: 1,
    });
    const offer = offers.find((candidate) => candidate.available);
    if (!offer) {
      return NextResponse.json({ error: "No available Apaleo sandbox offer was found for these dates." }, { status: 409 });
    }

    const externalReference = `IRP-CERT-${crypto.randomUUID()}`;
    let reservation;
    try {
      reservation = await adapter.createReservation({
        propertyCode,
        arrivalDate: input.arrivalDate,
        departureDate: input.departureDate,
        adults: input.adults,
        rooms: 1,
        offerId: offer.offerId,
        externalReference,
        guest: { firstName: "iRatePilot", lastName: "Certification" },
      });
    } catch (error) {
      console.error("Apaleo sandbox reservation creation outcome is ambiguous", {
        externalReference,
        propertyCode,
        name: error instanceof Error ? error.name : "UnknownError",
      });
      return NextResponse.json({
        error: "Apaleo may have created the reservation but did not return a conclusive response. Search Apaleo using the external reference before retrying.",
        propertyCode,
        externalReference,
        actionRequired: true,
      }, { status: 502, headers: { "Cache-Control": "no-store" } });
    }

    try {
      const cancellation = await adapter.cancelReservation({
        propertyCode,
        reservationId: reservation.reservationId,
        externalReference,
        reason: "Automated iRatePilot sandbox certification test",
      });
      return NextResponse.json({
        propertyCode,
        reservationId: reservation.reservationId,
        reservationStatus: reservation.status,
        cancellationStatus: cancellation.status,
        message: "Apaleo sandbox reservation was created and cancelled. No payment was created.",
      }, { headers: { "Cache-Control": "no-store" } });
    } catch (error) {
      console.error("Apaleo sandbox reservation requires manual cancellation", {
        reservationId: reservation.reservationId,
        propertyCode,
        name: error instanceof Error ? error.name : "UnknownError",
      });
      return NextResponse.json({
        error: "The sandbox reservation was created but automatic cancellation failed. Cancel it in Apaleo before retrying.",
        propertyCode,
        reservationId: reservation.reservationId,
        actionRequired: true,
      }, { status: 502, headers: { "Cache-Control": "no-store" } });
    }
  } catch (error) {
    return handledError(error);
  }
}
