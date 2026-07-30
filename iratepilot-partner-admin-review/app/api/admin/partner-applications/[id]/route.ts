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

    const { data, error } = await auth.supabase
      .from("partner_applications")
      .update({ status: parsed.data.status })
      .eq("id", id)
      .select("id,property_name,status")
      .single();

    if (error) throw error;
    return NextResponse.json({ data });
  } catch {
    return NextResponse.json(
      { error: "The application decision could not be saved." },
      { status: 503 }
    );
  }
}
