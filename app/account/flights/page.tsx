import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ConsumerFlightPreviewTrips } from "@/components/flights/consumer-preview/my-flights";
import {
  ConsumerFlightPreviewDisclosure,
  ConsumerFlightPreviewFrame,
  ConsumerFlightPreviewHeading,
  ConsumerFlightPreviewUnavailable,
} from "@/components/flights/consumer-preview/preview-frame";
import { listConsumerFlightOrders } from "@/lib/flights/consumer-preview/repository.server";
import { getFlightConsumerPreviewPageRuntime } from "@/lib/flights/consumer-preview/runtime-authority.server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "My Preview Flights",
  robots: { index: false, follow: false },
};

export default async function ConsumerFlightPreviewTripsPage() {
  const runtime = await getFlightConsumerPreviewPageRuntime();
  if (!runtime.enabled) return <ConsumerFlightPreviewUnavailable />;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=${encodeURIComponent("/account/flights")}`);
  const orders = await listConsumerFlightOrders();

  return (
    <ConsumerFlightPreviewFrame>
      <ConsumerFlightPreviewHeading
        eyebrow="Authenticated account records"
        title="My Preview flights"
        description="These are durable, owner-bound test orders. Browser history and copied URLs cannot create or alter a trip record."
        actions={<Link href="/flights/preview" className="border border-white/50 px-5 py-3 text-xs font-semibold uppercase tracking-[.12em] text-white hover:bg-white hover:text-black">New test journey</Link>}
      />
      <div className="container-page py-10">
        <ConsumerFlightPreviewDisclosure compact />
        <div className="mt-7"><ConsumerFlightPreviewTrips enabled={runtime.enabled} orders={orders} /></div>
      </div>
    </ConsumerFlightPreviewFrame>
  );
}
