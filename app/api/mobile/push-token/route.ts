import { NextResponse } from "next/server";
import { z } from "zod";

import { createRequestClient } from "@/lib/supabase/request";

const registrationSchema = z.object({
  token: z.string().trim().min(20).max(256).regex(/^ExponentPushToken\[[A-Za-z0-9_-]+\]$|^ExpoPushToken\[[A-Za-z0-9_-]+\]$/),
  platform: z.enum(["ios", "android"]),
});

export async function POST(request: Request) {
  const supabase = await createRequestClient(request);
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });

  const parsed = registrationSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid notification registration." }, { status: 400 });

  const { error } = await supabase.from("mobile_push_tokens").upsert({
    user_id: user.id,
    expo_push_token: parsed.data.token,
    platform: parsed.data.platform,
    enabled: true,
    updated_at: new Date().toISOString(),
  }, { onConflict: "expo_push_token" });

  if (error) return NextResponse.json({ error: "Unable to save notification preference." }, { status: 503 });
  return NextResponse.json({ enabled: true }, { headers: { "Cache-Control": "no-store" } });
}

export async function DELETE(request: Request) {
  const supabase = await createRequestClient(request);
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });

  const parsed = registrationSchema.pick({ token: true }).safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid notification registration." }, { status: 400 });

  const { error } = await supabase.from("mobile_push_tokens")
    .delete()
    .eq("user_id", user.id)
    .eq("expo_push_token", parsed.data.token);

  if (error) return NextResponse.json({ error: "Unable to remove notification preference." }, { status: 503 });
  return NextResponse.json({ enabled: false }, { headers: { "Cache-Control": "no-store" } });
}
