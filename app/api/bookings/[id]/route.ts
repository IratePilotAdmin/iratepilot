import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

const cancellationSchema = z.object({ reason: z.string().trim().max(500).optional() });

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) return NextResponse.json({ error: "Invalid booking ID." }, { status: 400 });
  const parsed = cancellationSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: "Invalid cancellation reason." }, { status: 400 });
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
    const { data, error } = await supabase.rpc("cancel_pending_booking", { p_booking_id: id, p_reason: parsed.data.reason || null });
    if (error) return NextResponse.json({ error: error.message }, { status: 409 });
    return NextResponse.json({ data, message: "Pending request cancelled. No payment was collected." });
  } catch {
    return NextResponse.json({ error: "The request could not be cancelled." }, { status: 503 });
  }
}
