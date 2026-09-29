import "server-only";

import { createRequestClient } from "@/lib/supabase/request";
import { createClient } from "@/lib/supabase/server";

/**
 * Authenticates a request with Supabase's verified user lookup.
 *
 * Route Handlers should pass their Request so bearer-authenticated clients and
 * browser cookie sessions share the same boundary. Server Components may omit
 * it and use the cookie-backed SSR client. Callers must still authorize the
 * returned user against the resource being accessed.
 */
export async function requireUser(request?: Request) {
  const supabase = request
    ? await createRequestClient(request)
    : await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();

  if (error || !user) {
    return { error: "Authentication required.", status: 401 as const };
  }

  return { supabase, user };
}
