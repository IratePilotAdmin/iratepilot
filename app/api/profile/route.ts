import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

const profileSchema = z.object({ fullName: z.string().trim().min(2).max(120), phone: z.string().trim().max(30).optional() });

export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
    const { data, error } = await supabase.from("profiles").select("full_name,phone,membership_tier,reward_points").eq("id", user.id).single();
    if (error) throw error;
    return NextResponse.json({ data: { ...data, email: user.email } });
  } catch {
    return NextResponse.json({ error: "Profile is not configured." }, { status: 503 });
  }
}

export async function PATCH(request: Request) {
  const parsed = profileSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: "Enter a valid name and phone number." }, { status: 400 });
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
    const { data, error } = await supabase.rpc("update_own_profile", {
      p_full_name: parsed.data.fullName,
      p_phone: parsed.data.phone || null
    });
    if (error) throw error;
    return NextResponse.json({ data, message: "Profile updated." });
  } catch {
    return NextResponse.json({ error: "Profile could not be updated." }, { status: 503 });
  }
}
