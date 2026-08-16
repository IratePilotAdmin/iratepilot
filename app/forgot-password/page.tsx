import Link from "next/link";
import { ForgotPasswordForm } from "@/components/forms/forgot-password-form";
import { getSupabasePublicConfig } from "@/lib/supabase/config";

type ForgotPasswordPageProps = {
  searchParams: Promise<{ error?: string }>;
};

export default async function ForgotPasswordPage({ searchParams }: ForgotPasswordPageProps) {
  const { configured } = getSupabasePublicConfig();
  const { error } = await searchParams;
  const recoveryError = error === "recovery_link_invalid"
    ? "That password-reset link is invalid or expired. Request a new link below."
    : null;

  return <main className="flex min-h-screen items-center justify-center p-6"><div className="card w-full max-w-md p-8"><Link href="/" className="font-bold text-brand-700">iRatePilot</Link><h1 className="mt-6 text-2xl font-bold">Reset your password</h1><p className="mt-2 text-sm text-slate-500">Enter your account email and we will send you a secure reset link.</p>{recoveryError && <p role="alert" className="mt-4 text-sm text-red-700">{recoveryError}</p>}<div className="mt-6"><ForgotPasswordForm configured={configured} /></div><p className="mt-6 text-center text-sm"><Link href="/login" className="font-semibold text-slate-950 underline">Back to sign in</Link></p></div></main>;
}
