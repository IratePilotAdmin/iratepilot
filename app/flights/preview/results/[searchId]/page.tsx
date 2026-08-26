import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ConsumerFlightPreviewResults } from "@/components/flights/consumer-preview/results";
import {
  ConsumerFlightPreviewDisclosure,
  ConsumerFlightPreviewFrame,
  ConsumerFlightPreviewHeading,
  ConsumerFlightPreviewUnavailable,
} from "@/components/flights/consumer-preview/preview-frame";
import { getConsumerFlightSearch } from "@/lib/flights/consumer-preview/repository.server";
import { getFlightConsumerPreviewPageRuntime } from "@/lib/flights/consumer-preview/runtime-authority.server";
import { createClient } from "@/lib/supabase/server";

type Params = Promise<{ searchId: string }>;

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Test Flight Results",
  robots: { index: false, follow: false },
};

export default async function ConsumerFlightPreviewResultsPage({ params }: { params: Params }) {
  const runtime = await getFlightConsumerPreviewPageRuntime();
  if (!runtime.enabled) return <ConsumerFlightPreviewUnavailable />;

  const { searchId } = await params;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(searchId)) notFound();
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(`/flights/preview/results/${searchId}`)}`);

  const search = await getConsumerFlightSearch(searchId);
  if (!search) notFound();

  return (
    <ConsumerFlightPreviewFrame>
      <ConsumerFlightPreviewHeading
        eyebrow="Duffel test inventory"
        title="Choose persisted test evidence."
        description="Every offer below was stored against this authenticated search. Choosing one triggers a fresh server-side validation before an owner-bound test order is created."
        actions={<Link href="/flights/preview" className="border border-white/50 px-5 py-3 text-xs font-semibold uppercase tracking-[.12em] text-white hover:bg-white hover:text-black">New test search</Link>}
      />
      <div className="container-page pt-8"><ConsumerFlightPreviewDisclosure compact /></div>
      <ConsumerFlightPreviewResults enabled={runtime.enabled} search={search} />
    </ConsumerFlightPreviewFrame>
  );
}
