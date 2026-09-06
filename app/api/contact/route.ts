import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { contactSchema } from "@/lib/validation";
import { HOTEL_MANAGER_INTEREST_MESSAGE_PREFIX } from "@/lib/hotels/manager-interest";
import { readBoundedJson, RequestBodyTooLargeError } from "@/lib/http/read-bounded-json";

// Fits maximum-length fields even when JSON uses six-byte Unicode escapes.
const MAX_CONTACT_BYTES = 24_000;

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await readBoundedJson(request, MAX_CONTACT_BYTES);
  } catch (error) {
    if (error instanceof RequestBodyTooLargeError) {
      return NextResponse.json({ error: "The contact form is too large." }, { status: 413 });
    }
    return NextResponse.json({ error: "The contact form must be valid JSON." }, { status: 400 });
  }

  const parsed = contactSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Please provide a valid name, email, and message." }, { status: 400 });
  if (parsed.data.message.startsWith(HOTEL_MANAGER_INTEREST_MESSAGE_PREFIX)) {
    return NextResponse.json(
      { error: "Please use the hotel manager intake form for hotel onboarding requests." },
      { status: 400 },
    );
  }
  try {
    const admin = createAdminClient();
    const { error } = await admin.from("contact_messages").insert(parsed.data);
    if (error) throw error;
    return NextResponse.json({ status: "received" }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Contact service is not configured yet." }, { status: 503 });
  }
}
