import { NextResponse } from "next/server";
import {
  createRecoveryMarker,
  recoveryMarkerCookieName,
  recoveryMarkerCookieOptions,
  recoveryMarkerMaxAge,
} from "@/lib/auth/recovery-marker";
import { createClient } from "@/lib/supabase/server";

export async function POST() {
  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    return NextResponse.json(
      { error: "A verified recovery session is required." },
      { status: 401 },
    );
  }

  const { data: claimsData, error: claimsError } = await supabase.auth.getClaims();
  const now = Math.floor(Date.now() / 1000);
  const recentRecoveryOtp = claimsData?.claims.sub === user.id
    && Array.isArray(claimsData.claims.amr)
    && claimsData.claims.amr.some((entry) => (
      typeof entry === "object"
      && entry !== null
      && entry.method === "otp"
      && entry.timestamp > now - recoveryMarkerMaxAge
      && entry.timestamp <= now + 60
    ));

  if (claimsError || !recentRecoveryOtp) {
    return NextResponse.json(
      { error: "A recent password-recovery verification is required." },
      { status: 403 },
    );
  }

  const response = NextResponse.json({ verified: true });
  response.cookies.set(recoveryMarkerCookieName, createRecoveryMarker(user.id), {
    ...recoveryMarkerCookieOptions,
    maxAge: recoveryMarkerMaxAge,
  });
  return response;
}
