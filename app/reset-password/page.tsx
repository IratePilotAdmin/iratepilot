import Link from "next/link";
import { ResetPasswordForm } from "@/components/forms/reset-password-form";
import { getSupabasePublicConfig } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function ResetPasswordPage() {
  const { configured } = getSupabasePublicConfig();
  const supabase = configured ? await createClient() : null;
  const user = supabase ? (await supabase.auth.getUser()).data.user : null;

  if (!user) {
    return <main className="flex min-h-screen items-center justify-center p-6"><div className="card w-full max-w-md p-8"><Link href="/" className="font-bold text-brand-700">iRatePilot</Link><h1 className="mt-6 text-2xl font-bold">Reset link required</h1><p className="mt-2 text-sm text-slate-500">Open the newest password-reset email to start a secure recovery session.</p><p className="mt-6"><Link href="/forgot-password" className="btn-primary inline-flex">Request a new reset link</Link></p></div></main>;
  }

  return <main className="flex min-h-screen items-center justify-center p-6"><div className="card w-full max-w-md p-8"><Link href="/" className="font-bold text-brand-700">iRatePilot</Link><h1 className="mt-6 text-2xl font-bold">Choose a new password</h1><p className="mt-2 text-sm text-slate-500">Use at least eight characters for your new password.</p><div className="mt-6"><ResetPasswordForm configured={configured} /></div></div></main>;
}
