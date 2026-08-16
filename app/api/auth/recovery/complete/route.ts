import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import {
  recoveryMarkerCookieName,
  recoveryMarkerCookieOptions,
  verifyRecoveryMarker,
} from "@/lib/auth/recovery-marker";
import { createClient } from "@/lib/supabase/server";

export async function POST() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const cookieStore = await cookies();
  const marker = cookieStore.get(recoveryMarkerCookieName)?.value;

  if (!user || !verifyRecoveryMarker(marker, user.id)) {
    return NextResponse.json({ error: "A verified recovery session is required." }, { status: 403 });
  }

  const response = NextResponse.json({ cleared: true });
  response.cookies.set(recoveryMarkerCookieName, "", {
    ...recoveryMarkerCookieOptions,
    maxAge: 0,
  });
  return response;
}

