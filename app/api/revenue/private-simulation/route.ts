import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/require-role";
import { buildPrivateRevenueSimulation } from "@/lib/revenue-private-simulation";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const auth = await requireRole(["admin"]);
    if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });
    return NextResponse.json(buildPrivateRevenueSimulation(new Date()), {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch {
    return NextResponse.json({ error: "The private simulation could not run." }, { status: 503 });
  }
}
