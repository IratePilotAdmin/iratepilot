import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/require-role";
import {
  apaleoOAuthCookieName,
  apaleoOAuthCookieOptions,
  verifyApaleoOAuthMarker,
} from "@/lib/integrations/apaleo-oauth-state";
import { decryptPmsCredentials, encryptPmsCredentials } from "@/lib/integrations/pms-credentials";
import { createAdminClient } from "@/lib/supabase/admin";
import { exchangeApaleoAuthorizationCode } from "@/services/hotel-suppliers";

export const dynamic = "force-dynamic";

const callbackUrl = () => new URL(
  "/api/admin/integrations/pms/apaleo/callback",
  process.env.NEXT_PUBLIC_APP_URL || "https://www.iratepilot.com",
).toString();

function settingsRedirect(request: Request, result: "connected" | "failed") {
  return new URL(`/admin/settings?apaleo=${result}#pms-credential-vault`, request.url);
}

export async function GET(request: Request) {
  const auth = await requireRole(["admin"]);
  if ("error" in auth) return NextResponse.redirect(settingsRedirect(request, "failed"));
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const cookieStore = await cookies();
  const marker = verifyApaleoOAuthMarker(
    cookieStore.get(apaleoOAuthCookieName)?.value,
    { state: state || "", userId: auth.user.id },
  );
  const clearAndRedirect = (result: "connected" | "failed") => {
    const response = NextResponse.redirect(settingsRedirect(request, result));
    response.cookies.set(apaleoOAuthCookieName, "", { ...apaleoOAuthCookieOptions, maxAge: 0 });
    return response;
  };
  if (!code || !state || !marker) return clearAndRedirect("failed");

  try {
    const admin = createAdminClient();
    const connection = await admin.from("property_pms_connections")
      .select("id,provider_id")
      .eq("id", marker.connectionId)
      .maybeSingle();
    if (connection.error) throw connection.error;
    if (!connection.data || connection.data.provider_id !== "apaleo") throw new Error("Apaleo connection not found.");
    const stored = await admin.from("property_pms_credentials")
      .select("ciphertext,initialization_vector,authentication_tag,key_version")
      .eq("connection_id", marker.connectionId)
      .maybeSingle();
    if (stored.error || !stored.data) throw stored.error || new Error("Apaleo credentials not found.");
    const credentials = decryptPmsCredentials({
      ciphertext: stored.data.ciphertext,
      initializationVector: stored.data.initialization_vector,
      authenticationTag: stored.data.authentication_tag,
      keyVersion: stored.data.key_version,
    });
    const token = await exchangeApaleoAuthorizationCode({
      clientId: credentials.PMS_APALEO_CLIENT_ID,
      clientSecret: credentials.PMS_APALEO_CLIENT_SECRET,
      code,
      redirectUri: callbackUrl(),
    });
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
    }).eq("connection_id", marker.connectionId);
    if (updated.error) throw updated.error;
    return clearAndRedirect("connected");
  } catch (error) {
    console.error("Apaleo OAuth callback failed", {
      name: error instanceof Error ? error.name : "UnknownError",
      message: error instanceof Error ? error.message : "Unknown error",
    });
    return clearAndRedirect("failed");
  }
}
