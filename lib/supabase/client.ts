import { createBrowserClient } from "@supabase/ssr";
import { getSupabasePublicConfig } from "@/lib/supabase/config";

export function createClient() {
  const { url, key } = getSupabasePublicConfig();
  if (!url || !key) throw new Error("Supabase public environment variables are missing.");
  return createBrowserClient(url, key);
}
