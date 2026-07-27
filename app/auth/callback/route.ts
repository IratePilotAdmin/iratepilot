import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const requestedNext = url.searchParams.get("next");
  const nextPath = requestedNext?.startsWith("/") && !requestedNext.startsWith("//") ? requestedNext : null;

  if (!code) return NextResponse.redirect(new URL("/login?error=missing_code", url.origin));

  try {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) throw error;
    let destination = nextPath;
    if (!destination) {
      const { data: { user } } = await supabase.auth.getUser();
      const { data: profile } = user ? await supabase.from("profiles").select("role").eq("id", user.id).single() : { data: null };
      destination = profile?.role === "admin" ? "/admin" : profile?.role === "partner" ? "/partner/dashboard" : "/account";
    }
    return NextResponse.redirect(new URL(destination, url.origin));
  } catch {
    return NextResponse.redirect(new URL("/login?error=authentication_failed", url.origin));
  }
}
