import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { contactSchema } from "@/lib/validation";

export async function POST(request: Request) {
  const parsed = contactSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: "Please provide a valid name, email, and message." }, { status: 400 });
  try {
    const admin = createAdminClient();
    const { error } = await admin.from("contact_messages").insert(parsed.data);
    if (error) throw error;
    return NextResponse.json({ status: "received" }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Contact service is not configured yet." }, { status: 503 });
  }
}
