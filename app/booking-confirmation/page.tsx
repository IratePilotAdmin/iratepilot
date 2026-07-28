import Link from "next/link";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function ConfirmationPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const code = typeof params.code === "string" ? params.code : "";
  return <main className="flex min-h-screen items-center justify-center p-6"><div className="card max-w-xl p-10 text-center"><div className="text-5xl">✓</div><h1 className="mt-5 text-3xl font-bold">Your test stay is confirmed</h1><p className="mt-3 text-slate-500">{code ? `Confirmation ${code}` : "Your booking confirmation is available in Trips."}</p><p className="mt-2 text-sm text-slate-500">Stripe test mode was used. No real money was charged.</p><Link href="/account/trips" className="btn-primary mt-8">View trip</Link></div></main>;
}
