import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/require-role";
import { createTravelPlan, travelPlanRequestSchema } from "@/lib/ai/openai-provider";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const auth = await requireRole(["customer", "partner", "admin"]);
  if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

  let input: unknown;
  try {
    input = await request.json();
  } catch {
    return NextResponse.json({ error: "Please enter a travel-planning request." }, { status: 400 });
  }

  const parsed = travelPlanRequestSchema.safeParse(input);
  if (!parsed.success) {
    return NextResponse.json({ error: "Enter a travel-planning request between 3 and 2,000 characters." }, { status: 400 });
  }

  try {
    const result = await createTravelPlan(parsed.data.message);
    return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const code = error instanceof Error ? error.message : "";
    if (code === "OPENAI_PROVIDER_DISABLED") {
      return NextResponse.json({ error: "The AI travel planner is not enabled yet." }, { status: 503 });
    }
    console.error("OpenAI travel-plan request failed", code);
    return NextResponse.json({ error: "The AI travel planner is temporarily unavailable." }, { status: 503 });
  }
}
