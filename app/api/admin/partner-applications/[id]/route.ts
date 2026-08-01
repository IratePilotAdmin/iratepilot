import { NextResponse } from "next/server";
import { z } from "zod";
import { requireRole } from "@/lib/auth/require-role";

const decisionSchema = z.object({
  status: z.enum(["pending", "approved", "declined"]),
});

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) {
    return NextResponse.json({ error: "Invalid application ID." }, { status: 400 });
  }

  const parsed = decisionSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid review decision." }, { status: 400 });
  }

  try {
    const auth = await requireRole(["admin"]);
    if ("error" in auth) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const { data, error } = await auth.supabase.rpc(
      "review_partner_application",
      { p_application_id: id, p_status: parsed.data.status }
    );

    if (error) {
      if (error.message.includes("must register with the application email")) {
        return NextResponse.json({ error: error.message }, { status: 409 });
      }
      if (error.message.includes("Approved partner access must be managed separately")) {
        return NextResponse.json({ error: error.message }, { status: 409 });
      }
      throw error;
    }
    return NextResponse.json({ data });
  } catch {
    return NextResponse.json(
      { error: "The application decision could not be saved." },
      { status: 503 }
    );
  }
}
