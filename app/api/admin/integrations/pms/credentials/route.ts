import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/require-role";
import {
  decryptPmsCredentials,
  encryptPmsCredentials,
} from "@/lib/integrations/pms-credentials";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  ApaleoConnectionTestError,
  CloudbedsConnectionTestError,
  getPmsProvider,
  MewsConnectionTestError,
  OracleOperaConnectionTestError,
  testApaleoSandboxConnection,
  testCloudbedsSandboxConnection,
  testMewsSandboxConnection,
  testOracleOperaSandboxConnection,
  validatePmsConfiguration,
} from "@/services/hotel-suppliers";

export const dynamic = "force-dynamic";

type CredentialRequest = {
  connectionId?: unknown;
  credentials?: unknown;
};

function credentialRecord(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const entries = Object.entries(value);
  if (entries.length === 0 || entries.length > 20) return null;
  if (entries.some(([key, item]) =>
    !/^[A-Z][A-Z0-9_]*$/.test(key)
    || typeof item !== "string"
    || item.trim().length === 0
    || item.length > 4096)) return null;
  return Object.fromEntries(entries.map(([key, item]) => [key, (item as string).trim()]));
}

async function connection(admin: ReturnType<typeof createAdminClient>, id: string) {
  const result = await admin
    .from("property_pms_connections")
    .select("id,provider_id")
    .eq("id", id)
    .maybeSingle();
  if (result.error) throw result.error;
  return result.data;
}

export async function PUT(request: Request) {
  const auth = await requireRole(["admin"]);
  if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

  try {
    const body = await request.json() as CredentialRequest;
    if (typeof body.connectionId !== "string") {
      return NextResponse.json({ error: "A connection ID is required." }, { status: 400 });
    }
    const credentials = credentialRecord(body.credentials);
    if (!credentials) {
      return NextResponse.json({ error: "Credentials are incomplete or invalid." }, { status: 400 });
    }

    const admin = createAdminClient();
    const selected = await connection(admin, body.connectionId);
    if (!selected) return NextResponse.json({ error: "PMS connection not found." }, { status: 404 });
    const provider = getPmsProvider(selected.provider_id);
    if (!provider) return NextResponse.json({ error: "PMS provider is not supported." }, { status: 400 });

    const environment = Object.fromEntries(
      Object.entries(credentials).map(([key, value]) => [
        key.startsWith(`${provider.environmentPrefix}_`)
          ? key
          : `${provider.environmentPrefix}_${key}`,
        value,
      ]),
    );
    const validation = validatePmsConfiguration(provider, environment);
    if (validation.missingConfiguration.length || validation.invalidConfiguration.length) {
      return NextResponse.json({
        error: "Required PMS configuration is missing or invalid.",
        missingConfiguration: validation.missingConfiguration,
        invalidConfiguration: validation.invalidConfiguration,
      }, { status: 400 });
    }

    const encrypted = encryptPmsCredentials(environment);
    const stored = await admin.from("property_pms_credentials").upsert({
      connection_id: selected.id,
      ciphertext: encrypted.ciphertext,
      initialization_vector: encrypted.initializationVector,
      authentication_tag: encrypted.authenticationTag,
      key_version: encrypted.keyVersion,
      configured_by: auth.user.id,
      updated_at: new Date().toISOString(),
    }, { onConflict: "connection_id" });
    if (stored.error) throw stored.error;

    return NextResponse.json({
      connectionId: selected.id,
      providerId: provider.id,
      configuredKeys: validation.configuredKeys,
      message: "PMS credentials were encrypted and stored.",
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("PMS credentials could not be stored", error);
    return NextResponse.json({ error: "PMS credentials could not be stored." }, { status: 503 });
  }
}

export async function POST(request: Request) {
  const auth = await requireRole(["admin"]);
  if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

  try {
    const body = await request.json() as CredentialRequest;
    if (typeof body.connectionId !== "string") {
      return NextResponse.json({ error: "A connection ID is required." }, { status: 400 });
    }
    const admin = createAdminClient();
    const selected = await connection(admin, body.connectionId);
    if (!selected) return NextResponse.json({ error: "PMS connection not found." }, { status: 404 });
    const provider = getPmsProvider(selected.provider_id);
    if (!provider) return NextResponse.json({ error: "PMS provider is not supported." }, { status: 400 });

    const stored = await admin.from("property_pms_credentials")
      .select("ciphertext,initialization_vector,authentication_tag,key_version")
      .eq("connection_id", selected.id)
      .maybeSingle();
    if (stored.error) throw stored.error;
    if (!stored.data) return NextResponse.json({ error: "PMS credentials have not been configured." }, { status: 409 });

    const credentials = decryptPmsCredentials({
      ciphertext: stored.data.ciphertext,
      initializationVector: stored.data.initialization_vector,
      authenticationTag: stored.data.authentication_tag,
      keyVersion: stored.data.key_version,
    });
    const validation = validatePmsConfiguration(provider, credentials);
    const configurationPassed = validation.missingConfiguration.length === 0
      && validation.invalidConfiguration.length === 0;
    let passed = configurationPassed;
    let validationMode: "configuration_only" | "vendor_sandbox" = "configuration_only";
    let liveVendorConnectionTested = false;
    let detailCode = configurationPassed
      ? "encrypted_configuration_valid"
      : "configuration_invalid";
    let serviceCount: number | undefined;
    let hotelCount: number | undefined;
    let propertyCount: number | undefined;

    if (configurationPassed && provider.id === "oracle-opera") {
      validationMode = "vendor_sandbox";
      liveVendorConnectionTested = true;
      try {
        const result = await testOracleOperaSandboxConnection({
          baseUrl: credentials.PMS_ORACLE_OPERA_BASE_URL,
          tokenUrl: credentials.PMS_ORACLE_OPERA_TOKEN_URL
            || `${credentials.PMS_ORACLE_OPERA_BASE_URL}/oauth/v1/tokens`,
          clientId: credentials.PMS_ORACLE_OPERA_CLIENT_ID,
          clientSecret: credentials.PMS_ORACLE_OPERA_CLIENT_SECRET,
          appKey: credentials.PMS_ORACLE_OPERA_APP_KEY,
          hotelId: credentials.PMS_ORACLE_OPERA_HOTEL_ID,
          timeoutMs: 15_000,
        });
        hotelCount = result.hotelCount;
        detailCode = "oracle_opera_titles_read_succeeded";
      } catch (error) {
        passed = false;
        detailCode = error instanceof OracleOperaConnectionTestError
          ? error.detailCode
          : "oracle_opera_sandbox_unreachable";
      }
    } else if (configurationPassed && provider.id === "mews") {
      validationMode = "vendor_sandbox";
      liveVendorConnectionTested = true;
      try {
        const result = await testMewsSandboxConnection({
          baseUrl: credentials.PMS_MEWS_BASE_URL,
          clientToken: credentials.PMS_MEWS_CLIENT_TOKEN,
          accessToken: credentials.PMS_MEWS_ACCESS_TOKEN,
          client: credentials.PMS_MEWS_CLIENT,
        });
        serviceCount = result.serviceCount;
        detailCode = "mews_services_read_succeeded";
      } catch (error) {
        passed = false;
        detailCode = error instanceof MewsConnectionTestError
          ? error.detailCode
          : "mews_sandbox_unreachable";
      }
    } else if (configurationPassed && provider.id === "cloudbeds") {
      validationMode = "vendor_sandbox";
      liveVendorConnectionTested = true;
      try {
        const result = await testCloudbedsSandboxConnection({
          baseUrl: credentials.PMS_CLOUDBEDS_BASE_URL,
          apiKey: credentials.PMS_CLOUDBEDS_API_KEY,
        });
        hotelCount = result.hotelCount;
        detailCode = "cloudbeds_hotels_read_succeeded";
      } catch (error) {
        passed = false;
        detailCode = error instanceof CloudbedsConnectionTestError
          ? error.detailCode
          : "cloudbeds_sandbox_unreachable";
      }
    } else if (configurationPassed && provider.id === "apaleo") {
      validationMode = "vendor_sandbox";
      liveVendorConnectionTested = true;
      try {
        const result = await testApaleoSandboxConnection({
          baseUrl: credentials.PMS_APALEO_BASE_URL,
          clientId: credentials.PMS_APALEO_CLIENT_ID,
          clientSecret: credentials.PMS_APALEO_CLIENT_SECRET,
        });
        propertyCount = result.propertyCount;
        detailCode = "apaleo_properties_read_succeeded";
      } catch (error) {
        passed = false;
        detailCode = error instanceof ApaleoConnectionTestError
          ? error.detailCode
          : "apaleo_sandbox_unreachable";
      }
    }
    const testedAt = new Date().toISOString();

    const event = await admin.from("pms_connection_test_events").insert({
      connection_id: selected.id,
      validation_mode: validationMode,
      result: passed ? "passed" : "failed",
      detail_code: detailCode,
      tested_by: auth.user.id,
      created_at: testedAt,
    });
    if (event.error) throw event.error;
    if (passed && liveVendorConnectionTested) {
      const updated = await admin.from("property_pms_connections").update({
        connection_status: "sandbox",
        last_validated_at: testedAt,
        updated_at: testedAt,
      }).eq("id", selected.id);
      if (updated.error) throw updated.error;
    }

    return NextResponse.json({
      connectionId: selected.id,
      providerId: provider.id,
      passed,
      validationMode,
      liveVendorConnectionTested,
      testedAt,
      ...(serviceCount === undefined ? {} : { serviceCount }),
      ...(hotelCount === undefined ? {} : { hotelCount }),
      ...(propertyCount === undefined ? {} : { propertyCount }),
    }, { status: passed ? 200 : 422, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("PMS configuration test failed", error);
    return NextResponse.json({ error: "PMS configuration could not be tested." }, { status: 503 });
  }
}
