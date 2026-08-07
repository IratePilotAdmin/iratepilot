import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/require-role";
import { buildPmsReadiness } from "@/services/hotel-suppliers";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const auth = await requireRole(["admin"]);
    if ("error" in auth) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    return NextResponse.json(
      { providers: buildPmsReadiness(process.env) },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    console.error("PMS integration readiness failed", error);
    return NextResponse.json(
      { error: "PMS integration readiness could not be loaded." },
      { status: 503 },
    );
  }
}
