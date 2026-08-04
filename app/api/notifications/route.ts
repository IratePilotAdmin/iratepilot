import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

const readSchema = z.object({
  id: z.string().uuid().optional(),
  all: z.literal(true).optional(),
}).refine((value) => Boolean(value.id) !== Boolean(value.all));

export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
    const { data, error } = await supabase.from("notifications").select("id,title,body,read_at,created_at")
      .eq("user_id", user.id).order("created_at", { ascending: false }).limit(50);
    if (error) throw error;
    return NextResponse.json({ data }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Notification lookup failed", error);
    return NextResponse.json({ error: "Notifications are not configured." }, { status: 503 });
  }
}

export async function PATCH(request: Request) {
  const parsed = readSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Choose one notification or mark all as read." }, { status: 400 });
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
    const readAt = new Date().toISOString();
    let update = supabase.from("notifications")
      .update({ read_at: readAt })
      .eq("user_id", user.id)
      .is("read_at", null);
    if (parsed.data.id) update = update.eq("id", parsed.data.id);
    const { data, error } = await update.select("id");
    if (error) throw error;
    if (parsed.data.id && !data.length) {
      return NextResponse.json({ error: "Unread notification not found." }, { status: 404 });
    }
    return NextResponse.json({ data, updated: data.length, readAt }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Notification read update failed", error);
    return NextResponse.json({ error: "Notification status could not be updated." }, { status: 503 });
  }
}
