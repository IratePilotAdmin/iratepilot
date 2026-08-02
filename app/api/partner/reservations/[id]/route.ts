import { NextResponse } from "next/server";
import { z } from "zod";
import { requireRole } from "@/lib/auth/require-role";

const reviewSchema = z.object({
  decision: z.enum(["approve", "reject"]),
  reason: z.string().trim().max(500).optional()
});

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) return NextResponse.json({ error: "Invalid booking ID." }, { status: 400 });
  const parsed = reviewSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: "Choose approve or reject." }, { status: 400 });
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
    const { data, error } = await auth.supabase.rpc("review_booking", {
      p_booking_id: id, p_decision: parsed.data.decision, p_reason: parsed.data.reason || null
    });
    if (error) return NextResponse.json({ error: error.message }, { status: 409 });
    return NextResponse.json({ data, message: parsed.data.decision === "approve" ? "Reservation approved and inventory held." : "Request declined." });
  } catch {
    return NextResponse.json({ error: "The booking decision could not be saved." }, { status: 503 });
  }
}
