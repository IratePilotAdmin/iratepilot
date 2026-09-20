import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ConsumerFlightPreviewAuthoritativeCompletionRecovery } from "@/components/flights/consumer-preview/authoritative-completion-recovery";
import { ConsumerFlightPreviewConfirmation } from "@/components/flights/consumer-preview/confirmation";
import {
  ConsumerFlightPreviewDisclosure,
  ConsumerFlightPreviewFrame,
  ConsumerFlightPreviewHeading,
  ConsumerFlightPreviewUnavailable,
} from "@/components/flights/consumer-preview/preview-frame";
import { getConsumerFlightOrder } from "@/lib/flights/consumer-preview/repository.server";
import { getFlightConsumerPreviewPageRuntime } from "@/lib/flights/consumer-preview/runtime-authority.server";
import { createClient } from "@/lib/supabase/server";

type Params = Promise<{ orderId: string }>;

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Test Flight Receipt",
  robots: { index: false, follow: false },
};

export default async function ConsumerFlightPreviewConfirmationPage({ params }: { params: Params }) {
  const runtime = await getFlightConsumerPreviewPageRuntime();
  if (!runtime.enabled) return <ConsumerFlightPreviewUnavailable />;

  const { orderId } = await params;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(orderId)) notFound();
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(`/flights/preview/confirmation/${orderId}`)}`);

  const order = await getConsumerFlightOrder(orderId);
  if (!order) notFound();

  return (
    <ConsumerFlightPreviewFrame>
      <ConsumerFlightPreviewHeading
        eyebrow="Authoritative test status"
        title="Read the durable record—not the URL."
        description="This page can display completion only when the authenticated order, Stripe test payment, Duffel test order, and test-ticket evidence agree in the database."
        actions={<Link href="/account/flights" className="border border-white/50 px-5 py-3 text-xs font-semibold uppercase tracking-[.12em] text-white hover:bg-white hover:text-black">All Preview flights</Link>}
      />
      <div className="container-page pt-8">
        <ConsumerFlightPreviewDisclosure compact />
        <ConsumerFlightPreviewAuthoritativeCompletionRecovery
          orderId={order.id}
          shouldResume={[
            "pending_payment",
            "payment_authorized",
            "order_creating",
          ].includes(order.status)}
        />
      </div>
      <ConsumerFlightPreviewConfirmation enabled={runtime.enabled} order={order} />
    </ConsumerFlightPreviewFrame>
  );
}
