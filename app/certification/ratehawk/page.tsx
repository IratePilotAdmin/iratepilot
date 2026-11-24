import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { SiteFooter } from "@/components/layout/site-footer";
import { SiteHeader } from "@/components/layout/site-header";
import { RatehawkCertificationReviewCheckout } from "@/components/ratehawk/certification-review-checkout";
import { isRatehawkCertificationReviewer } from "@/lib/ratehawk/certification-review-access";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "RateHawk Certification Review",
  description: "Authenticated test-only review of iRatePilot's RateHawk sandbox booking lifecycle.",
  robots: { index: false, follow: false },
};

function dateOnly(daysFromNow: number) {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + daysFromNow);
  return date.toISOString().slice(0, 10);
}

export default async function RatehawkCertificationReviewPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=${encodeURIComponent("/certification/ratehawk")}`);
  if (!isRatehawkCertificationReviewer(user.email)) notFound();
  const search = new URLSearchParams({
    destination: "Los Angeles",
    checkIn: dateOnly(30),
    checkOut: dateOnly(32),
    guests: "2",
    childAges: "",
  });

  return <>
    <SiteHeader />
    <main>
      <section className="bg-neutral-950 text-white">
        <div className="container-page py-12 sm:py-16">
          <span className="section-kicker text-neutral-400">RateHawk certification · authenticated reviewer</span>
          <h1 className="mt-4 max-w-4xl text-4xl sm:text-6xl">Review booking, payment, and cancellation without Production traffic.</h1>
          <p className="mt-5 max-w-3xl leading-7 text-neutral-300">This private Preview uses RateHawk sandbox inventory and Stripe test mode only. Every supplier reservation is a certification test and is cancelled during the same workflow. No real card charge or Production booking can be created.</p>
          <Link className="mt-7 inline-flex border border-white/60 px-5 py-3 text-sm font-semibold hover:bg-white hover:text-black" href={`/search?${search.toString()}`}>Open Los Angeles certification search</Link>
        </div>
      </section>
      <section className="container-page py-10">
        <div className="mb-8 grid gap-px border border-neutral-300 bg-neutral-300 md:grid-cols-3">
          {[
            ["01", "Restricted access", "Only authenticated email addresses on the certification reviewer allowlist can open this page."],
            ["02", "Test payment only", "The server rejects live Stripe keys and the page accepts Stripe test cards only."],
            ["03", "Sandbox booking only", "The workflow uses RateHawk sandbox credentials, confirms a certification reservation, and cancels it."],
          ].map(([number, title, detail]) => <article key={number} className="bg-white p-6"><span className="text-xs font-semibold text-neutral-500">{number}</span><h2 className="mt-4 text-xl">{title}</h2><p className="mt-2 text-sm leading-6 text-neutral-600">{detail}</p></article>)}
        </div>
        <RatehawkCertificationReviewCheckout publishableKey={process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? ""} />
      </section>
    </main>
    <SiteFooter />
  </>;
}

