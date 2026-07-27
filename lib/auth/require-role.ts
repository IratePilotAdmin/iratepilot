import { createClient } from "@/lib/supabase/server";

export async function requireRole(allowed: Array<"customer" | "partner" | "admin">) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Authentication required.", status: 401 as const };

  const { data: profile } = await supabase.from("profiles").select("role,full_name").eq("id", user.id).single();
  if (!profile || !allowed.includes(profile.role)) return { error: "You do not have permission to perform this action.", status: 403 as const };

  return { supabase, user, profile };
}
