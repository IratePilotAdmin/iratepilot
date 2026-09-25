import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/require-role";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await requireRole(["partner", "admin"]);
  if ("error" in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  try {
    const manual = await readFile(join(process.cwd(), "docs", "IRATEPILOT_PMS_OPERATING_MANUAL.md"));
    return new Response(manual, {
      headers: {
        "Cache-Control": "private, no-store",
        "Content-Disposition": 'attachment; filename="iRatePilot-PMS-Operating-Manual.md"',
        "Content-Length": String(manual.byteLength),
        "Content-Type": "text/markdown; charset=utf-8",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return NextResponse.json({ error: "The PMS operating manual is temporarily unavailable." }, { status: 503 });
  }
}
