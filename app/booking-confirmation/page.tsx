import Link from "next/link";
export default function ConfirmationPage() {
  return <main className="flex min-h-screen items-center justify-center p-6"><div className="card max-w-xl p-10 text-center"><div className="text-5xl">✓</div><h1 className="mt-5 text-3xl font-bold">Your stay is confirmed</h1><p className="mt-3 text-slate-500">Confirmation IRP-10482 has been sent to your email.</p><Link href="/account/trips" className="btn-primary mt-8">View trip</Link></div></main>;
}
