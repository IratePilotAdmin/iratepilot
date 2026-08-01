import Link from "next/link";
import { LoginForm } from "@/components/forms/login-form";
import { getSupabasePublicConfig } from "@/lib/supabase/config";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function LoginPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const requestedNext = typeof params.next === "string" ? params.next : null;
  const nextPath = requestedNext?.startsWith("/") && !requestedNext.startsWith("//") ? requestedNext : null;
  const registerHref = nextPath ? `/register?next=${encodeURIComponent(nextPath)}` : "/register";
  const { configured } = getSupabasePublicConfig();
  return <main className="flex min-h-screen items-center justify-center p-6"><div className="card w-full max-w-md p-8"><Link href="/" className="font-bold text-brand-700">iRatePilot</Link><h1 className="mt-6 text-2xl font-bold">Welcome back</h1><p className="mt-2 text-sm text-slate-500">Sign in to manage trips, rewards, or properties.</p><div className="mt-6"><LoginForm configured={configured} /></div><p className="mt-6 text-center text-sm text-slate-500">New to iRatePilot? <Link href={registerHref} className="font-semibold text-slate-950 underline">Create an account</Link></p></div></main>;
}
