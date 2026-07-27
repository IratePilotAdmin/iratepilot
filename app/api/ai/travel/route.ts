import { NextResponse } from "next/server";
import { z } from "zod";

const promptSchema = z.object({ prompt: z.string().trim().min(2).max(1000) });

export async function POST(request: Request) {
  const parsed = promptSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: "Enter a travel request between 2 and 1,000 characters." }, { status: 400 });
  return NextResponse.json({
    mode: "demo",
    message: "Your request was received. Live AI recommendations will be enabled after verified inventory and the knowledge base are connected."
  });
}
