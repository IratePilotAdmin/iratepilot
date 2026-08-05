import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/require-role";
import { bookingMessageSchema } from "@/lib/validation";

type BookingAccess = {
  id: string;
  customer_id: string | null;
  confirmation_code: string;
  properties: { name?: string; partners?: { owner_id?: string; status?: string } | null } | null;
};

async function authorize(id: string) {
  const auth = await requireRole(["customer", "partner", "admin"]);
  if ("error" in auth) return { ok: false as const, error: auth.error, status: auth.status };
  const { data, error } = await auth.supabase.from("bookings")
    .select("id,customer_id,confirmation_code,properties(name,partners(owner_id,status))")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  const booking = data as unknown as BookingAccess | null;
  if (!booking) return { ok: false as const, error: "Booking not found.", status: 404 as const };
  const partner = booking.properties?.partners;
  const allowed = auth.profile.role === "admin"
    || booking.customer_id === auth.user.id
    || (partner?.owner_id === auth.user.id && partner.status === "approved");
  if (!allowed) return { ok: false as const, error: "You do not have access to this booking conversation.", status: 403 as const };
  return { ok: true as const, ...auth, booking };
}

export async function GET(_: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const access = await authorize(id);
    if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });
    const { data, error } = await access.supabase.from("booking_messages")
      .select("id,sender_id,body,created_at,profiles(full_name,role)")
      .eq("booking_id", id)
      .order("created_at", { ascending: true })
      .limit(200);
    if (error) throw error;
    return NextResponse.json({
      booking: { confirmationCode: access.booking.confirmation_code, propertyName: access.booking.properties?.name || "Property" },
      data: (data || []).map((message) => ({ ...message, isMine: message.sender_id === access.user.id })),
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Booking message thread failed", error);
    return NextResponse.json({ error: "Booking messages could not be loaded." }, { status: 503 });
  }
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const access = await authorize(id);
    if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });
    const parsed = bookingMessageSchema.safeParse(await request.json());
    if (!parsed.success) return NextResponse.json({ error: "Enter a message between 1 and 2,000 characters." }, { status: 400 });
    const { data, error } = await access.supabase.rpc("send_booking_message", { p_booking_id: id, p_body: parsed.data.body });
    if (error) return NextResponse.json({ error: error.message }, { status: 409 });
    return NextResponse.json({ data, message: "Message sent." }, { status: 201 });
  } catch (error) {
    console.error("Booking message send failed", error);
    return NextResponse.json({ error: "Booking message could not be sent." }, { status: 503 });
  }
}
