import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/require-role";
import { decryptPmsCredentials, encryptPmsCredentials } from "@/lib/integrations/pms-credentials";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  ApaleoConnectionTestError,
  ApaleoWebhookError,
  createApaleoWebhookSubscription,
  deleteApaleoWebhookSubscription,
  getApaleoAccessToken,
  listApaleoProperties,
} from "@/services/hotel-suppliers";

export const dynamic = "force-dynamic";

type AdminClient = ReturnType<typeof createAdminClient>;

function connectionIdFrom(request: Request) {
  const value = new URL(request.url).searchParams.get("connectionId")?.trim();
  return value && value.length <= 100 ? value : null;
}

async function loadConnection(connectionId: string) {
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

async function storeCredentials(
  admin: AdminClient,
  connectionId: string,
  configuredBy: string,
  credentials: Record<string, string>,
) {
  const encrypted = encryptPmsCredentials(credentials);
  const updated = await admin.from("property_pms_credentials").update({
    ciphertext: encrypted.ciphertext,
    initialization_vector: encrypted.initializationVector,
    authentication_tag: encrypted.authenticationTag,
    key_version: encrypted.keyVersion,
    configured_by: configuredBy,
    updated_at: new Date().toISOString(),
  }).eq("connection_id", connectionId);
  if (updated.error) throw updated.error;
}

function cleanWebhookValues(credentials: Record<string, string>) {
  const cleaned = { ...credentials };
  delete cleaned.PMS_APALEO_WEBHOOK_SECRET;
  delete cleaned.PMS_APALEO_WEBHOOK_SUBSCRIPTION_ID;
  delete cleaned.PMS_APALEO_WEBHOOK_PROPERTY_CODE;
  return cleaned;
}

function callbackUrl(connectionId: string, secret: string) {
  const base = new URL(process.env.NEXT_PUBLIC_APP_URL || "https://www.iratepilot.com");
  if (base.protocol !== "https:") throw new Error("The public iRatePilot URL must use HTTPS");
  const endpoint = new URL(`/api/webhooks/apaleo/${encodeURIComponent(connectionId)}`, base);
  endpoint.searchParams.set("token", secret);
  return endpoint.toString();
}

function errorResponse(error: unknown) {
  if (error instanceof ApaleoConnectionTestError || error instanceof ApaleoWebhookError) {
    return NextResponse.json(
      { error: error.message, detailCode: error.detailCode },
      { status: error.status },
    );
  }
  console.error("Apaleo webhook lifecycle failed", {
    name: error instanceof Error ? error.name : "UnknownError",
    message: error instanceof Error ? error.message : "Unknown error",
  });
  return NextResponse.json({ error: "Apaleo webhook lifecycle could not be completed." }, { status: 503 });
}

export async function GET(request: Request) {
  const auth = await requireRole(["admin"]);
  if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const connectionId = connectionIdFrom(request);
  if (!connectionId) return NextResponse.json({ error: "A connection ID is required." }, { status: 400 });
  try {
    const loaded = await loadConnection(connectionId);
    if (!loaded.ok) return loaded.response;
    const subscriptionId = loaded.credentials.PMS_APALEO_WEBHOOK_SUBSCRIPTION_ID;
    const endpointSecret = loaded.credentials.PMS_APALEO_WEBHOOK_SECRET;
    const subscriptionProperty = loaded.credentials.PMS_APALEO_WEBHOOK_PROPERTY_CODE;
    if ([subscriptionId, endpointSecret, subscriptionProperty].filter(Boolean).length > 0
      && !(subscriptionId && endpointSecret && subscriptionProperty)) {
      return NextResponse.json({
        error: "Apaleo webhook setup is incomplete and requires manual cleanup.",
      }, { status: 409, headers: { "Cache-Control": "no-store" } });
    }
    return NextResponse.json({
      active: Boolean(subscriptionId),
      propertyCode: subscriptionProperty || null,
      events: subscriptionId ? ["reservation/*"] : [],
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  const auth = await requireRole(["admin"]);
  if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const body = await request.json().catch(() => null) as { connectionId?: unknown } | null;
  const connectionId = typeof body?.connectionId === "string" ? body.connectionId.trim() : "";
  if (!connectionId || connectionId.length > 100) {
    return NextResponse.json({ error: "A valid connection ID is required." }, { status: 400 });
  }
  try {
    const loaded = await loadConnection(connectionId);
    if (!loaded.ok) return loaded.response;
    const propertyCode = loaded.connection.external_property_code?.trim();
    if (!propertyCode) {
      return NextResponse.json({ error: "Select an authorized Apaleo property first." }, { status: 409 });
    }
    if (loaded.credentials.PMS_APALEO_WEBHOOK_SUBSCRIPTION_ID) {
      return NextResponse.json({ error: "An Apaleo webhook subscription is already active." }, { status: 409 });
    }
    if (loaded.credentials.PMS_APALEO_WEBHOOK_SECRET || loaded.credentials.PMS_APALEO_WEBHOOK_PROPERTY_CODE) {
      return NextResponse.json({
        error: "Apaleo webhook setup is incomplete and requires manual cleanup before retrying.",
      }, { status: 409 });
    }
    const propertyResult = await listApaleoProperties({
      baseUrl: loaded.credentials.PMS_APALEO_BASE_URL,
      clientId: loaded.credentials.PMS_APALEO_CLIENT_ID,
      clientSecret: loaded.credentials.PMS_APALEO_CLIENT_SECRET,
      refreshToken: loaded.credentials.PMS_APALEO_REFRESH_TOKEN,
    });
    if (!propertyResult.properties.some((property) => property.id === propertyCode)) {
      return NextResponse.json({ error: "The selected property is no longer authorized in Apaleo." }, { status: 409 });
    }
    const baseCredentials = cleanWebhookValues({
      ...loaded.credentials,
      ...(propertyResult.refreshToken ? { PMS_APALEO_REFRESH_TOKEN: propertyResult.refreshToken } : {}),
    });
    const secret = randomBytes(32).toString("base64url");
    const pendingCredentials = {
      ...baseCredentials,
      PMS_APALEO_WEBHOOK_SECRET: secret,
      PMS_APALEO_WEBHOOK_PROPERTY_CODE: propertyCode,
    };
    await storeCredentials(loaded.admin, connectionId, auth.user.id, pendingCredentials);

    let subscription: { id: string };
    try {
      subscription = await createApaleoWebhookSubscription({
        accessToken: propertyResult.accessToken,
        endpointUrl: callbackUrl(connectionId, secret),
        propertyCode,
        events: ["reservation/*"],
      });
    } catch (error) {
      await storeCredentials(loaded.admin, connectionId, auth.user.id, baseCredentials);
      throw error;
    }

    try {
      await storeCredentials(loaded.admin, connectionId, auth.user.id, {
        ...pendingCredentials,
        PMS_APALEO_WEBHOOK_SUBSCRIPTION_ID: subscription.id,
      });
    } catch (error) {
      try {
        await deleteApaleoWebhookSubscription({
          accessToken: propertyResult.accessToken,
          subscriptionId: subscription.id,
        });
        await storeCredentials(loaded.admin, connectionId, auth.user.id, baseCredentials);
      } catch (cleanupError) {
        console.error("Apaleo webhook rollback failed", {
          name: cleanupError instanceof Error ? cleanupError.name : "UnknownError",
        });
      }
      throw error;
    }

    return NextResponse.json({
      active: true,
      propertyCode,
      events: ["reservation/*"],
      message: "Apaleo reservation webhook enabled for the selected property. Live booking traffic remains disabled.",
    }, { status: 201, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(request: Request) {
  const auth = await requireRole(["admin"]);
  if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const connectionId = connectionIdFrom(request);
  if (!connectionId) return NextResponse.json({ error: "A connection ID is required." }, { status: 400 });
  try {
    const loaded = await loadConnection(connectionId);
    if (!loaded.ok) return loaded.response;
    const subscriptionId = loaded.credentials.PMS_APALEO_WEBHOOK_SUBSCRIPTION_ID;
    if (!subscriptionId) {
      return NextResponse.json({ active: false, message: "No Apaleo webhook subscription is active." });
    }
    const token = await getApaleoAccessToken({
      baseUrl: loaded.credentials.PMS_APALEO_BASE_URL,
      clientId: loaded.credentials.PMS_APALEO_CLIENT_ID,
      clientSecret: loaded.credentials.PMS_APALEO_CLIENT_SECRET,
      refreshToken: loaded.credentials.PMS_APALEO_REFRESH_TOKEN,
    });
    await deleteApaleoWebhookSubscription({
      accessToken: token.accessToken,
      subscriptionId,
    });
    const cleaned = cleanWebhookValues({
      ...loaded.credentials,
      ...(token.refreshToken ? { PMS_APALEO_REFRESH_TOKEN: token.refreshToken } : {}),
    });
    await storeCredentials(loaded.admin, connectionId, auth.user.id, cleaned);
    return NextResponse.json({
      active: false,
      message: "Apaleo webhook subscription removed. No new Apaleo events will be accepted for this connection.",
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return errorResponse(error);
  }
}
