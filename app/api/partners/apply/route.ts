import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { partnerApplicationSchema } from "@/lib/validation";

export async function POST(request: Request) {
  const parsed = partnerApplicationSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: "Please complete every application field." }, { status: 400 });
  try {
    const admin = createAdminClient();
    const { error } = await admin.from("partner_applications").insert({
      property_name: parsed.data.propertyName,
      contact_name: parsed.data.contactName,
      email: parsed.data.email,
      property_type: parsed.data.propertyType,
      status: "pending",
    });
    if (error) throw error;
    return NextResponse.json({ status: "received" }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Partner applications are not configured yet." }, { status: 503 });
  }
}
