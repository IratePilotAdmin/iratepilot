import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

const schema = z.object({
  reason: z.string().trim().min(3).max(500)
});

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Please provide a cancellation reason." }, { status: 400 });
  }
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
    const { id } = await context.params;
    const { data, error } = await supabase.rpc("request_booking_cancellation", {
      p_booking_id: id,
      p_reason: parsed.data.reason
    });
    if (error) throw error;
    return NextResponse.json({
      data,
      message: "Cancellation request submitted for review."
    });
  } catch {
    return NextResponse.json({
      error: "This confirmed stay could not be submitted for cancellation."
    }, { status: 409 });
  }
}
