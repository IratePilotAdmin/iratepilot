import { NextResponse } from "next/server";
import { z } from "zod";
import { requireRole } from "@/lib/auth/require-role";
import { createAdminClient } from "@/lib/supabase/admin";

const statusSchema = z.object({ status: z.enum(["new", "in_progress", "resolved"]) });

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) {
    return NextResponse.json({ error: "Invalid support case ID." }, { status: 400 });
  }
  const parsed = statusSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Choose a valid support status." }, { status: 400 });

  try {
    const auth = await requireRole(["admin"]);
    if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const admin = createAdminClient();
    const { data, error } = await admin.from("contact_messages")
      .update({ status: parsed.data.status })
      .eq("id", id)
      .select("id,status")
      .maybeSingle();
    if (error) throw error;
    if (!data) return NextResponse.json({ error: "Support case not found." }, { status: 404 });

    const message = parsed.data.status === "resolved"
      ? "Support case resolved."
      : parsed.data.status === "in_progress"
        ? "Support case marked in progress."
        : "Support case reopened.";
    return NextResponse.json({ data, message });
  } catch (error) {
    console.error("Admin support update failed", error);
    return NextResponse.json({ error: "Support case status could not be updated." }, { status: 503 });
  }
}
