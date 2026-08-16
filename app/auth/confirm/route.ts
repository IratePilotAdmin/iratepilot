import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  createRecoveryMarker,
  recoveryMarkerCookieName,
  recoveryMarkerCookieOptions,
  recoveryMarkerMaxAge,
} from "@/lib/auth/recovery-marker";

const invalidRecoveryPath = "/forgot-password?error=recovery_link_invalid";

const invalidRecoveryResponse = (request: NextRequest) => {
  const response = NextResponse.redirect(new URL(invalidRecoveryPath, request.url));
  response.cookies.set(recoveryMarkerCookieName, "", {
    ...recoveryMarkerCookieOptions,
    maxAge: 0,
  });
  return response;
};

export async function GET(request: NextRequest) {
  const tokenHash = request.nextUrl.searchParams.get("token_hash");
  const type = request.nextUrl.searchParams.get("type");

  if (!tokenHash || type !== "recovery") {
    return invalidRecoveryResponse(request);
  }

  try {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.verifyOtp({
      token_hash: tokenHash,
      type: "recovery",
    });

    if (error) throw error;
    const userId = data.user?.id ?? data.session?.user.id;
    if (!userId) throw new Error("Password recovery verification returned no user.");

    const response = NextResponse.redirect(new URL("/reset-password", request.url));
    response.cookies.set(recoveryMarkerCookieName, createRecoveryMarker(userId), {
      ...recoveryMarkerCookieOptions,
      maxAge: recoveryMarkerMaxAge,
    });
    return response;
  } catch (error) {
    console.error("Supabase password recovery confirmation failed", {
      name: error instanceof Error ? error.name : "UnknownError",
      message: error instanceof Error ? error.message : String(error),
    });

    return invalidRecoveryResponse(request);
  }
}

