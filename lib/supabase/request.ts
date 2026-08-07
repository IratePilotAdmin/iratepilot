import { createClient as createSupabaseClient } from "@supabase/supabase-js";

import { getSupabasePublicConfig } from "@/lib/supabase/config";
import { createClient as createCookieClient } from "@/lib/supabase/server";

export async function createRequestClient(request: Request) {
  const authorization = request.headers.get("authorization");
  if (!authorization?.startsWith("Bearer ")) return createCookieClient();

  const token = authorization.slice("Bearer ".length).trim();
  if (!token) return createCookieClient();

  const { url, key } = getSupabasePublicConfig();
  if (!url || !key) throw new Error("Supabase public environment variables are missing.");

  return createSupabaseClient(url, key, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
  });
}
