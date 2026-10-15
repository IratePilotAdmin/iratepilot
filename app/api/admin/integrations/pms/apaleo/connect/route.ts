import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/require-role";
import {
  apaleoOAuthCookieName,
  apaleoOAuthCookieOptions,
  apaleoOAuthMaxAge,
  createApaleoOAuthMarker,
} from "@/lib/integrations/apaleo-oauth-state";
import { decryptPmsCredentials } from "@/lib/integrations/pms-credentials";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

const callbackUrl = () => new URL(
  "/api/admin/integrations/pms/apaleo/callback",
  process.env.NEXT_PUBLIC_APP_URL || "https://www.iratepilot.com",
).toString();

export async function GET(request: Request) {
  const auth = await requireRole(["admin"]);
  if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const connectionId = new URL(request.url).searchParams.get("connectionId");
  if (!connectionId) return NextResponse.json({ error: "A connection ID is required." }, { status: 400 });

  const admin = createAdminClient();
  const connection = await admin.from("property_pms_connections")
    .select("id,provider_id")
    .eq("id", connectionId)
    .maybeSingle();
  if (connection.error) throw connection.error;
  if (!connection.data || connection.data.provider_id !== "apaleo") {
    return NextResponse.json({ error: "Apaleo connection not found." }, { status: 404 });
  }
  const stored = await admin.from("property_pms_credentials")
    .select("ciphertext,initialization_vector,authentication_tag,key_version")
    .eq("connection_id", connectionId)
    .maybeSingle();
  if (stored.error) throw stored.error;
  if (!stored.data) return NextResponse.json({ error: "Store the Apaleo client credentials first." }, { status: 409 });
  const credentials = decryptPmsCredentials({
    ciphertext: stored.data.ciphertext,
    initializationVector: stored.data.initialization_vector,
    authenticationTag: stored.data.authentication_tag,
    keyVersion: stored.data.key_version,
  });
  const clientId = credentials.PMS_APALEO_CLIENT_ID;
  if (!clientId) return NextResponse.json({ error: "Apaleo client ID is missing." }, { status: 409 });

  const state = randomBytes(32).toString("base64url");
  const authorize = new URL("https://identity.apaleo.com/connect/authorize");
  authorize.searchParams.set("response_type", "code");
  authorize.searchParams.set("scope", "offline_access openid profile");
  authorize.searchParams.set("client_id", clientId);
  authorize.searchParams.set("redirect_uri", callbackUrl());
  authorize.searchParams.set("state", state);
  const response = NextResponse.redirect(authorize);
  response.cookies.set(apaleoOAuthCookieName, createApaleoOAuthMarker({
    connectionId,
    state,
    userId: auth.user.id,
  }), { ...apaleoOAuthCookieOptions, maxAge: apaleoOAuthMaxAge });
  return response;
}
