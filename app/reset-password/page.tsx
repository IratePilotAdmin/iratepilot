import Link from "next/link";
import { ResetPasswordForm } from "@/components/forms/reset-password-form";
import { getSupabasePublicConfig } from "@/lib/supabase/config";

export default function ResetPasswordPage() {
  const { configured } = getSupabasePublicConfig();

  return <main className="flex min-h-screen items-center justify-center p-6"><div className="card w-full max-w-md p-8"><Link href="/" className="font-bold text-brand-700">iRatePilot</Link><h1 className="mt-6 text-2xl font-bold">Choose a new password</h1><p className="mt-2 text-sm text-slate-500">Use at least eight characters for your new password.</p><div className="mt-6"><ResetPasswordForm configured={configured} /></div></div></main>;
}
