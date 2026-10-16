import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/require-role";
import { decryptPmsCredentials, encryptPmsCredentials } from "@/lib/integrations/pms-credentials";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  ApaleoConnectionTestError,
  listApaleoProperties,
} from "@/services/hotel-suppliers";

export const dynamic = "force-dynamic";

async function loadApaleoConnection(connectionId: string) {
  const admin = createAdminClient();
  const [connection, stored] = await Promise.all([
    admin.from("property_pms_connections")
      .select("id,provider_id,external_property_code")
      .eq("id", connectionId)
      .maybeSingle(),
    admin.from("property_pms_credentials")
      .select("ciphertext,initialization_vector,authentication_tag,key_version")
      .eq("connection_id", connectionId)
      .maybeSingle(),
  ]);
  if (connection.error) throw connection.error;
  if (stored.error) throw stored.error;
  if (!connection.data || connection.data.provider_id !== "apaleo") {
    return {
      ok: false as const,
      response: NextResponse.json({ error: "Apaleo connection not found." }, { status: 404 }),
    };
  }
  if (!stored.data) {
    return {
      ok: false as const,
      response: NextResponse.json({ error: "Store the Apaleo client credentials first." }, { status: 409 }),
    };
  }
  const credentials = decryptPmsCredentials({
    ciphertext: stored.data.ciphertext,
    initializationVector: stored.data.initialization_vector,
    authenticationTag: stored.data.authentication_tag,
    keyVersion: stored.data.key_version,
  });
  if (!credentials.PMS_APALEO_CLIENT_ID || !credentials.PMS_APALEO_CLIENT_SECRET) {
    return {
      ok: false as const,
      response: NextResponse.json({ error: "Apaleo client credentials are incomplete." }, { status: 409 }),
    };
  }
  return { ok: true as const, admin, connection: connection.data, credentials };
}

async function fetchAuthorizedProperties(connectionId: string, configuredBy: string) {
  const loaded = await loadApaleoConnection(connectionId);
  if (!loaded.ok) return loaded;
  const result = await listApaleoProperties({
    baseUrl: loaded.credentials.PMS_APALEO_BASE_URL,
    clientId: loaded.credentials.PMS_APALEO_CLIENT_ID,
    clientSecret: loaded.credentials.PMS_APALEO_CLIENT_SECRET,
    refreshToken: loaded.credentials.PMS_APALEO_REFRESH_TOKEN,
  });
  if (result.refreshToken && result.refreshToken !== loaded.credentials.PMS_APALEO_REFRESH_TOKEN) {
    const encrypted = encryptPmsCredentials({
      ...loaded.credentials,
      PMS_APALEO_REFRESH_TOKEN: result.refreshToken,
    });
    const updated = await loaded.admin.from("property_pms_credentials").update({
      ciphertext: encrypted.ciphertext,
      initialization_vector: encrypted.initializationVector,
      authentication_tag: encrypted.authenticationTag,
      key_version: encrypted.keyVersion,
      configured_by: configuredBy,
      updated_at: new Date().toISOString(),
    }).eq("connection_id", connectionId);
    if (updated.error) throw updated.error;
  }
  return { ...loaded, properties: result.properties };
}

function connectionIdFrom(request: Request) {
  const value = new URL(request.url).searchParams.get("connectionId")?.trim();
  return value && value.length <= 100 ? value : null;
}

function errorResponse(error: unknown) {
  if (error instanceof ApaleoConnectionTestError) {
    return NextResponse.json(
      { error: error.message, detailCode: error.detailCode },
      { status: error.status },
    );
  }
  console.error("Apaleo property selection failed", {
    name: error instanceof Error ? error.name : "UnknownError",
    message: error instanceof Error ? error.message : "Unknown error",
  });
  return NextResponse.json({ error: "Apaleo properties could not be loaded." }, { status: 503 });
}

export async function GET(request: Request) {
  const auth = await requireRole(["admin"]);
  if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const connectionId = connectionIdFrom(request);
  if (!connectionId) {
    return NextResponse.json({ error: "A connection ID is required." }, { status: 400 });
  }
  try {
    const loaded = await fetchAuthorizedProperties(connectionId, auth.user.id);
    if (!loaded.ok) return loaded.response;
    return NextResponse.json({
      properties: loaded.properties,
      selectedPropertyCode: loaded.connection.external_property_code,
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PATCH(request: Request) {
  const auth = await requireRole(["admin"]);
  if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const body = await request.json().catch(() => null) as {
    connectionId?: unknown;
    propertyCode?: unknown;
  } | null;
  const connectionId = typeof body?.connectionId === "string" ? body.connectionId.trim() : "";
  const propertyCode = typeof body?.propertyCode === "string" ? body.propertyCode.trim() : "";
  if (!connectionId || connectionId.length > 100 || !propertyCode || propertyCode.length > 120) {
    return NextResponse.json({ error: "A valid connection and Apaleo property are required." }, { status: 400 });
  }
  try {
    const loaded = await fetchAuthorizedProperties(connectionId, auth.user.id);
    if (!loaded.ok) return loaded.response;
    const selected = loaded.properties.find((property) => property.id === propertyCode);
    if (!selected) {
      return NextResponse.json({ error: "Choose a property authorized for this Apaleo account." }, { status: 409 });
    }
    const updated = await loaded.admin.from("property_pms_connections").update({
      external_property_code: selected.id,
      last_validated_at: null,
      updated_at: new Date().toISOString(),
    }).eq("id", connectionId).eq("provider_id", "apaleo")
      .select("id,external_property_code")
      .single();
    if (updated.error) throw updated.error;
    return NextResponse.json({
      property: selected,
      selectedPropertyCode: updated.data.external_property_code,
      message: "Apaleo property selection saved. Live traffic remains disabled.",
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return errorResponse(error);
  }
}
