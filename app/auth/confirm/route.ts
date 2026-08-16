import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

const invalidRecoveryPath = "/forgot-password?error=recovery_link_invalid";

export async function GET(request: NextRequest) {
  const tokenHash = request.nextUrl.searchParams.get("token_hash");
  const type = request.nextUrl.searchParams.get("type");

  if (!tokenHash || type !== "recovery") {
    return NextResponse.redirect(new URL(invalidRecoveryPath, request.url));
  }

  try {
    const supabase = await createClient();
    const { error } = await supabase.auth.verifyOtp({
      token_hash: tokenHash,
      type: "recovery",
    });

    if (error) throw error;

    return NextResponse.redirect(new URL("/reset-password", request.url));
  } catch (error) {
    console.error("Supabase password recovery confirmation failed", {
      name: error instanceof Error ? error.name : "UnknownError",
      message: error instanceof Error ? error.message : String(error),
    });

    return NextResponse.redirect(new URL(invalidRecoveryPath, request.url));
  }
}
