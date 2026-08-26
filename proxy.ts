import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { getSupabasePublicConfig } from "@/lib/supabase/config";

export async function proxy(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  const protectedRoute = pathname.startsWith("/account")
    || pathname.startsWith("/partner/")
    || pathname.startsWith("/admin")
    || pathname.startsWith("/flights/preview");
  if (!protectedRoute) return NextResponse.next();

  const { url, key } = getSupabasePublicConfig();
  if (!url || !key) return NextResponse.redirect(new URL("/login?reason=configuration", request.url));

  let response = NextResponse.next({ request });
  const supabase = createServerClient(url, key, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (cookies: { name: string; value: string; options: CookieOptions }[]) => {
        cookies.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookies.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      }
    }
  });

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(new URL(`/login?next=${encodeURIComponent(pathname)}`, request.url));

  if (pathname.startsWith("/admin") || pathname.startsWith("/partner/")) {
    const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
    const role = profile?.role;
    if (pathname.startsWith("/admin") && role !== "admin") return NextResponse.redirect(new URL("/account", request.url));
    if (pathname.startsWith("/partner/") && role !== "partner" && role !== "admin") return NextResponse.redirect(new URL("/partner", request.url));
  }
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"]
};
