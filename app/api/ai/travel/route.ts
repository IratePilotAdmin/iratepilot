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

  const { data: admission, error: admissionError } = await auth.supabase.rpc(
    "reserve_ai_travel_request_slot",
    { p_user_id: auth.user.id },
  );
  if (
    admissionError
    || !admission
    || typeof admission !== "object"
    || typeof admission.allowed !== "boolean"
    || typeof admission.retry_after_seconds !== "number"
  ) {
    console.error("OpenAI travel-plan admission failed", admissionError?.code ?? "invalid_response");
    return NextResponse.json(
      { error: "The AI travel planner is temporarily unavailable." },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
  if (!admission.allowed) {
    return NextResponse.json(
      { error: "You have reached the travel-planning limit. Please try again later." },
      {
        status: 429,
        headers: {
          "Cache-Control": "no-store",
          "Retry-After": String(Math.max(1, Math.ceil(admission.retry_after_seconds))),
        },
      },
    );
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
