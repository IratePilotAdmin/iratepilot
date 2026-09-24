import { NextResponse } from "next/server";
import { z } from "zod";
import { requireRole } from "@/lib/auth/require-role";
import { reservationReviewSchema } from "@/lib/validation";
import { queueBookingNotification } from "@/lib/email/booking-notifications";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) return NextResponse.json({ error: "Invalid booking ID." }, { status: 400 });
  const parsed = reservationReviewSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: "Choose approve, or provide a decline reason between 3 and 500 characters." }, { status: 400 });
  try {
    const auth = await requireRole(["partner", "admin"]);
    if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });
    if (auth.profile.role !== "admin") {
      const { data: partner, error: partnerError } = await auth.supabase.from("partners")
        .select("id,status").eq("owner_id", auth.user.id).maybeSingle();
      if (partnerError) throw partnerError;
      if (!partner || partner.status !== "approved") {
        return NextResponse.json({ error: "An approved partner account is required to review reservations." }, { status: 403 });
      }
    }
    const { data: booking } = await auth.supabase.from("bookings")
      .select("id,customer_id,confirmation_code")
      .eq("id", id).single();
    const { data, error } = await auth.supabase.rpc("review_booking", {
      p_booking_id: id, p_decision: parsed.data.decision, p_reason: parsed.data.reason || null
    });
    if (error) return NextResponse.json({ error: error.message }, { status: 409 });
    const reviewed = data as { status?: string } | null;
    const message = parsed.data.decision === "reject"
      ? "Request declined."
      : reviewed?.status === "confirmed"
        ? "Reservation approved and inventory held."
        : "Request expired because check-in has already begun. No inventory was held.";
    if (booking && (parsed.data.decision === "reject" || reviewed?.status === "confirmed")) {
      await queueBookingNotification({
        event: parsed.data.decision === "reject" ? "declined" : "approved",
        bookingId: booking.id,
        confirmationCode: booking.confirmation_code,
        customerId: booking.customer_id,
      });
    }
    return NextResponse.json({ data, message }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Reservation decision failed", error);
    return NextResponse.json({ error: "The booking decision could not be saved." }, { status: 503 });
  }
}
