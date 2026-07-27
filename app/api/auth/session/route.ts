import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ authenticated: false, user: null }, { status: 401 });
    const { data: profile } = await supabase.from("profiles").select("role,full_name").eq("id", user.id).single();
    return NextResponse.json({ authenticated: true, user: { id: user.id, email: user.email, role: profile?.role, fullName: profile?.full_name } });
  } catch {
    return NextResponse.json({ authenticated: false, user: null, configurationRequired: true }, { status: 503 });
  }
}
