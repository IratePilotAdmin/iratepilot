import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/require-role";
import { buildPaymentReadiness } from "@/lib/admin/payment-readiness";

export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await requireRole(["admin"]);
  if ("error" in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  return NextResponse.json(
    { data: buildPaymentReadiness(process.env) },
    { headers: { "Cache-Control": "no-store, private" } },
  );
}
