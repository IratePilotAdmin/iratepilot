import Link from "next/link";
import { RegisterForm } from "@/components/forms/register-form";
import { getSupabasePublicConfig } from "@/lib/supabase/config";

export default function RegisterPage() {
  const { configured } = getSupabasePublicConfig();
  return <main className="flex min-h-screen items-center justify-center p-6"><div className="card w-full max-w-lg p-8"><Link href="/" className="font-bold text-brand-700">iRatePilot</Link><h1 className="mt-6 text-2xl font-bold">Create your account</h1><p className="mt-2 text-sm text-slate-500">Use Google or email to join iRatePilot.</p><div className="mt-6"><RegisterForm configured={configured} /></div><p className="mt-6 text-center text-sm text-slate-500">Already have an account? <Link href="/login" className="font-semibold text-slate-950 underline">Sign in</Link></p></div></main>;
}
