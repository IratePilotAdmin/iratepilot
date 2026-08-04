import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/require-role";
import { createAdminClient } from "@/lib/supabase/admin";
import { buildPlatformReadiness } from "@/lib/admin/platform-readiness";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const auth = await requireRole(["admin"]);
    if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

    let databaseReachable = false;
    if (process.env.SUPABASE_SERVICE_ROLE_KEY) {
      try {
        const admin = createAdminClient();
        const { error } = await admin.from("profiles")
          .select("id", { count: "exact", head: true })
          .abortSignal(AbortSignal.timeout(4_000));
        databaseReachable = !error;
      } catch {
        databaseReachable = false;
      }
    }

    return NextResponse.json(buildPlatformReadiness(process.env, databaseReachable), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    console.error("Admin platform readiness failed", error);
    return NextResponse.json({ error: "Platform readiness could not be loaded." }, { status: 503 });
  }
}
