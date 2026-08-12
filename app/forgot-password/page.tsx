import Link from "next/link";
import { ForgotPasswordForm } from "@/components/forms/forgot-password-form";
import { getSupabasePublicConfig } from "@/lib/supabase/config";

export default function ForgotPasswordPage() {
  const { configured } = getSupabasePublicConfig();

  return <main className="flex min-h-screen items-center justify-center p-6"><div className="card w-full max-w-md p-8"><Link href="/" className="font-bold text-brand-700">iRatePilot</Link><h1 className="mt-6 text-2xl font-bold">Reset your password</h1><p className="mt-2 text-sm text-slate-500">Enter your account email and we will send you a secure reset link.</p><div className="mt-6"><ForgotPasswordForm configured={configured} /></div><p className="mt-6 text-center text-sm"><Link href="/login" className="font-semibold text-slate-950 underline">Back to sign in</Link></p></div></main>;
}
