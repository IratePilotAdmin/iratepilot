import Link from "next/link";
import { z } from "zod";
import { RegisterForm } from "@/components/forms/register-form";
import { getSupabasePublicConfig } from "@/lib/supabase/config";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function RegisterPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const requestedNext = typeof params.next === "string" ? params.next : null;
  const nextPath = requestedNext?.startsWith("/") && !requestedNext.startsWith("//") ? requestedNext : null;
  const requestedEmail = typeof params.email === "string" ? params.email.trim() : "";
  const initialEmail = z.string().email().max(254).safeParse(requestedEmail).success ? requestedEmail : "";
  const loginHref = nextPath ? `/login?next=${encodeURIComponent(nextPath)}` : "/login";
  const { configured } = getSupabasePublicConfig();
  return <main className="flex min-h-screen items-center justify-center p-6"><div className="card w-full max-w-lg p-8"><Link href="/" className="font-bold text-brand-700">iRatePilot</Link><h1 className="mt-6 text-2xl font-bold">Create your account</h1><p className="mt-2 text-sm text-slate-500">Use Google or email to join iRatePilot.</p><div className="mt-6"><RegisterForm configured={configured} nextPath={nextPath || "/account"} initialEmail={initialEmail} /></div><p className="mt-6 text-center text-sm text-slate-500">Already have an account? <Link href={loginHref} className="font-semibold text-slate-950 underline">Sign in</Link></p></div></main>;
}
