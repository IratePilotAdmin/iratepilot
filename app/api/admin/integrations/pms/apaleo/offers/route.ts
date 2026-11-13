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
  getApaleoAccessToken,
} from "@/services/hotel-suppliers/apaleo";

export const dynamic = "force-dynamic";

type SearchBody = {
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

function validation(body: SearchBody | null) {
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

function handledError(error: unknown) {
  if (error instanceof ApaleoConnectionTestError || error instanceof ApaleoTransportError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }
  console.error("Apaleo sandbox offer search failed", {
    name: error instanceof Error ? error.name : "UnknownError",
    message: error instanceof Error ? error.message : "Unknown error",
  });
  return NextResponse.json({ error: "Apaleo sandbox offers could not be loaded." }, { status: 503 });
}

export async function POST(request: Request) {
  const auth = await requireRole(["admin"]);
  if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const input = validation(await request.json().catch(() => null) as SearchBody | null);
  if (!input) {
    return NextResponse.json({
      error: "Choose valid dates within the next year for a 1–30 night stay and 1–8 adults.",
    }, { status: 400 });
  }

  try {
    const admin = createAdminClient();
    const [connection, stored] = await Promise.all([
      admin.from("property_pms_connections")
        .select("id,provider_id,external_property_code")
        .eq("id", input.connectionId)
        .maybeSingle(),
      admin.from("property_pms_credentials")
        .select("ciphertext,initialization_vector,authentication_tag,key_version")
        .eq("connection_id", input.connectionId)
        .maybeSingle(),
    ]);
    if (connection.error) throw connection.error;
    if (stored.error) throw stored.error;
    if (!connection.data || connection.data.provider_id !== "apaleo") {
      return NextResponse.json({ error: "Apaleo connection not found." }, { status: 404 });
    }
    if (!connection.data.external_property_code) {
      return NextResponse.json({ error: "Select an authorized Apaleo property first." }, { status: 409 });
    }
    if (!stored.data) {
      return NextResponse.json({ error: "Store the Apaleo credentials first." }, { status: 409 });
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

    const token = await getApaleoAccessToken({
      baseUrl: credentials.PMS_APALEO_BASE_URL,
      clientId,
      clientSecret,
      refreshToken: credentials.PMS_APALEO_REFRESH_TOKEN,
    });
    if (token.refreshToken && token.refreshToken !== credentials.PMS_APALEO_REFRESH_TOKEN) {
      const encrypted = encryptPmsCredentials({
        ...credentials,
        PMS_APALEO_REFRESH_TOKEN: token.refreshToken,
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
        accessToken: token.accessToken,
      }),
      new ApaleoBookingMapper(),
    );
    const offers = await adapter.availability({
      propertyCode: connection.data.external_property_code,
      arrivalDate: input.arrivalDate,
      departureDate: input.departureDate,
      adults: input.adults,
      rooms: 1,
    });

    return NextResponse.json({
      propertyCode: connection.data.external_property_code,
      arrivalDate: input.arrivalDate,
      departureDate: input.departureDate,
      offerCount: offers.length,
      offers: offers.slice(0, 20).map((offer) => ({
        roomTypeCode: offer.roomTypeCode,
        ratePlanCode: offer.ratePlanCode,
        currency: offer.currency,
        totalAmount: offer.totalAmount,
        available: offer.available,
      })),
      message: "Read-only Apaleo sandbox search completed. No booking or payment was created.",
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return handledError(error);
  }
}
