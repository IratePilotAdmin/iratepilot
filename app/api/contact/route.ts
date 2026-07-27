import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { contactSchema } from "@/lib/validation";

export async function POST(request: Request) {
  const parsed = contactSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: "Please provide a valid name, email, and message." }, { status: 400 });
  try {
    const supabase = await createClient();
    const { error } = await supabase.from("contact_messages").insert(parsed.data);
    if (error) throw error;
    return NextResponse.json({ status: "received" }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Contact service is not configured yet." }, { status: 503 });
  }
}
