import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ authenticated: false, user: null }, { status: 401, headers: { "Cache-Control": "no-store" } });
    const { data: profile } = await supabase.from("profiles").select("role,full_name").eq("id", user.id).single();
    return NextResponse.json({ authenticated: true, user: { id: user.id, email: user.email, role: profile?.role, fullName: profile?.full_name } }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ authenticated: false, user: null, configurationRequired: true }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}

export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) {
    return NextResponse.json({ error: "Invalid sign-out origin." }, { status: 403 });
  }
  try {
    const supabase = await createClient();
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
    return NextResponse.json({ signedOut: true }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Sign out failed", error);
    return NextResponse.json({ error: "Sign out could not be completed." }, { status: 503 });
  }
}
