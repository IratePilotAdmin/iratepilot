import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getSafeNextPath } from "@/lib/auth/safe-next-path";
import {
  createRecoveryMarker,
  isPasswordRecoveryExchange,
  recoveryMarkerCookieName,
  recoveryMarkerCookieOptions,
  recoveryMarkerMaxAge,
} from "@/lib/auth/recovery-marker";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const nextPath = getSafeNextPath(url.searchParams.get("next"));

  if (!code) {
    return NextResponse.redirect(
      new URL("/login?error=missing_code", url.origin)
    );
  }

  try {
    const supabase = await createClient();

    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) throw error;

    if (nextPath === "/reset-password") {
      if (!isPasswordRecoveryExchange(data)) {
        throw new Error("Authentication code was not issued for password recovery.");
      }

      const userId = data.user?.id ?? data.session?.user.id;
      if (!userId) throw new Error("Password recovery exchange returned no user.");

      const response = NextResponse.redirect(new URL("/reset-password", url.origin));
      response.cookies.set(recoveryMarkerCookieName, createRecoveryMarker(userId), {
        ...recoveryMarkerCookieOptions,
        maxAge: recoveryMarkerMaxAge,
      });
      return response;
    }

    let destination = nextPath;

    if (!destination) {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      const { data: profile } = user
        ? await supabase
            .from("profiles")
            .select("role")
            .eq("id", user.id)
            .single()
        : { data: null };

      destination =
        profile?.role === "admin"
          ? "/admin"
          : profile?.role === "partner"
            ? "/partner/dashboard"
            : "/account";
    }

    return NextResponse.redirect(new URL(destination, url.origin));
  } catch (error) {
    console.error("Supabase authentication callback failed", {
      name: error instanceof Error ? error.name : "UnknownError",
      message: error instanceof Error ? error.message : String(error),
    });

    return NextResponse.redirect(
      new URL("/login?error=authentication_failed", url.origin)
    );
  }
}

