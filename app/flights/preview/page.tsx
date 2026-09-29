import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowRight } from "lucide-react";
import { ConsumerFlightPreviewSearchForm } from "@/components/flights/consumer-preview/search-form";
import {
  ConsumerFlightPreviewDisclosure,
  ConsumerFlightPreviewFrame,
  ConsumerFlightPreviewHeading,
  ConsumerFlightPreviewUnavailable,
} from "@/components/flights/consumer-preview/preview-frame";
import { getFlightConsumerPreviewPageRuntime } from "@/lib/flights/consumer-preview/runtime-authority.server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Private Flight Preview",
  description: "Authenticated, test-only flight commerce verification for iRatePilot.",
  robots: { index: false, follow: false },
};

export default async function ConsumerFlightPreviewPage() {
  const runtime = await getFlightConsumerPreviewPageRuntime();
  if (!runtime.enabled) return <ConsumerFlightPreviewUnavailable />;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=${encodeURIComponent("/flights/preview")}`);

  return (
    <ConsumerFlightPreviewFrame>
      <ConsumerFlightPreviewHeading
        eyebrow="Authenticated consumer Preview"
        title="Verify a complete flight journey in test mode."
        description="Search durable Duffel test inventory, choose a revalidated offer, use fixed fictional travelers, and verify Stripe test-payment and ticket evidence without opening Production travel sales."
        actions={<Link href="/account/flights" className="inline-flex items-center gap-2 border border-white/50 px-5 py-3 text-xs font-semibold uppercase tracking-[.12em] text-white hover:bg-white hover:text-black">My Preview flights<ArrowRight aria-hidden="true" className="h-4 w-4" /></Link>}
      />
      <div className="container-page py-10">
        <ConsumerFlightPreviewDisclosure />
        <div className="mt-7"><ConsumerFlightPreviewSearchForm enabled={runtime.enabled} /></div>
        <section className="mt-10 grid gap-px border border-neutral-300 bg-neutral-300 md:grid-cols-3" aria-label="Preview safety boundaries">
          {[
            ["01", "Authenticated and owner-bound", "Searches and orders are tied to the signed-in account and read through row-level security."],
            ["02", "Durable evidence only", "Results, order states, payments, and tickets are reconstructed from server-side records—not query strings."],
            ["03", "Production stays closed", "The Preview accepts only Duffel test credentials, Stripe test keys, and an explicit server/database authority."],
          ].map(([number, title, detail]) => <article key={number} className="bg-white p-6"><span className="text-xs font-semibold text-neutral-500">{number}</span><h2 className="mt-5 text-xl">{title}</h2><p className="mt-3 text-sm leading-6 text-neutral-600">{detail}</p></article>)}
        </section>
      </div>
    </ConsumerFlightPreviewFrame>
  );
}
