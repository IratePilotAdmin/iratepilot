import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  decryptPmsCredentials,
  encryptPmsCredentials,
} from "@/lib/integrations/pms-credentials";
import {
  exchangeCloudbedsAuthorizationCode,
  getCloudbedsAuthorizedPropertyIds,
} from "@/services/hotel-suppliers";

export const runtime = "nodejs";

type Connection = {
  id: string;
  property_id: string;
  external_property_code: string;
};

type StoredCredential = {
  ciphertext: string;
  initialization_vector: string;
  authentication_tag: string;
  key_version: number;
};

function appBaseUrl() {
  const base = new URL(process.env.NEXT_PUBLIC_APP_URL || "https://www.iratepilot.com");
  if (base.protocol !== "https:") throw new Error("Application URL must use HTTPS");
  return base;
}

function callbackUrl() {
  return new URL("/api/integrations/cloudbeds/callback", appBaseUrl()).toString();
}

function supportRedirect(result: "connected" | "failed" | "unmatched") {
  const target = new URL("/support/cloudbeds", appBaseUrl());
  target.searchParams.set("cloudbeds", result);
  return NextResponse.redirect(target, 303);
}

function deliveryConfiguration() {
  return {
    clientId: process.env.CLOUDBEDS_CLIENT_ID?.trim() || "",
    clientSecret: process.env.CLOUDBEDS_CLIENT_SECRET?.trim() || "",
    redirectUri: callbackUrl(),
    tokenUrl: process.env.CLOUDBEDS_TOKEN_URL?.trim() || undefined,
    apiBaseUrl: process.env.CLOUDBEDS_API_BASE_URL?.trim() || undefined,
  };
}

async function existingCredentials(
  admin: ReturnType<typeof createAdminClient>,
  connectionId: string,
) {
  const { data, error } = await admin
    .from("property_pms_credentials")
    .select("ciphertext,initialization_vector,authentication_tag,key_version")
    .eq("connection_id", connectionId)
    .maybeSingle();
  if (error) throw new Error("Cloudbeds credentials could not be read");
  if (!data) return {};
  const stored = data as StoredCredential;
  return decryptPmsCredentials({
    ciphertext: stored.ciphertext,
    initializationVector: stored.initialization_vector,
    authenticationTag: stored.authentication_tag,
    keyVersion: stored.key_version,
  });
}

export async function GET(request: Request) {
  const code = new URL(request.url).searchParams.get("code")?.trim();
  if (!code) return supportRedirect("failed");

  try {
    const config = deliveryConfiguration();
    const apiKey = await exchangeCloudbedsAuthorizationCode(config, code);
    const propertyIds = await getCloudbedsAuthorizedPropertyIds({
      apiKey,
      apiBaseUrl: config.apiBaseUrl,
    });
    if (propertyIds.length === 0) return supportRedirect("unmatched");

    const admin = createAdminClient();
    const { data, error } = await admin
      .from("property_pms_connections")
      .select("id,property_id,external_property_code,properties!inner(partner_id,partners!inner(status))")
      .eq("provider_id", "cloudbeds")
      .eq("hotel_authorized", true)
      .eq("properties.partners.status", "approved")
      .in("external_property_code", propertyIds);
    if (error) throw new Error("Cloudbeds property mappings could not be read");
    const candidates = (data ?? []) as unknown as Connection[];
    const grouped = new Map<string, Connection[]>();
    candidates.forEach((connection) => {
      const group = grouped.get(connection.external_property_code) ?? [];
      group.push(connection);
      grouped.set(connection.external_property_code, group);
    });
    if ([...grouped.values()].some((group) => group.length !== 1)) {
      throw new Error("Cloudbeds property ownership is ambiguous");
    }
    const connections = [...grouped.values()].map(([connection]) => connection!);
    if (connections.length === 0) return supportRedirect("unmatched");

    const prepared = await Promise.all(connections.map(async (connection) => {
      const existing = await existingCredentials(admin, connection.id);
      const encrypted = encryptPmsCredentials({
        ...existing,
        PMS_CLOUDBEDS_BASE_URL: config.apiBaseUrl || "https://api.cloudbeds.com",
        PMS_CLOUDBEDS_API_KEY: apiKey,
      });
      return { connection, encrypted };
    }));
    const validatedAt = new Date().toISOString();

    const deliveryResult = await admin.rpc("complete_cloudbeds_api_key_delivery", {
      p_authorized_property_ids: propertyIds,
      p_deliveries: prepared.map(({ connection, encrypted }) => ({
        connection_id: connection.id,
        ciphertext: encrypted.ciphertext,
        initialization_vector: encrypted.initializationVector,
        authentication_tag: encrypted.authenticationTag,
        key_version: encrypted.keyVersion,
      })),
      p_validated_at: validatedAt,
    });
    if (deliveryResult.error || deliveryResult.data !== prepared.length) {
      throw new Error("Cloudbeds credentials could not be stored atomically");
    }

    return supportRedirect("connected");
  } catch {
    return supportRedirect("failed");
  }
}
