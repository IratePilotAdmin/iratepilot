import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ConsumerFlightPreviewCheckout } from "@/components/flights/consumer-preview/checkout";
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
  title: "Test Flight Checkout",
  robots: { index: false, follow: false },
};

export default async function ConsumerFlightPreviewCheckoutPage({ params }: { params: Params }) {
  const runtime = await getFlightConsumerPreviewPageRuntime();
  if (!runtime.enabled) return <ConsumerFlightPreviewUnavailable />;

  const { orderId } = await params;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(orderId)) notFound();
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(`/flights/preview/checkout/${orderId}`)}`);

  const order = await getConsumerFlightOrder(orderId);
  if (!order) notFound();

  return (
    <ConsumerFlightPreviewFrame>
      <ConsumerFlightPreviewHeading
        eyebrow="Fictional travelers · Stripe test mode"
        title="Verify payment and order orchestration."
        description="The browser can request a test payment, but only the server can validate the durable order, authorize and capture Stripe test funds, submit Duffel once, and record ticket evidence."
        actions={<Link href="/account/flights" className="border border-white/50 px-5 py-3 text-xs font-semibold uppercase tracking-[.12em] text-white hover:bg-white hover:text-black">My Preview flights</Link>}
      />
      <div className="container-page py-10">
        <ConsumerFlightPreviewDisclosure />
        <div className="mt-8"><ConsumerFlightPreviewCheckout key={order.id} enabled={runtime.enabled} order={order} publishableKey={process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY} /></div>
      </div>
    </ConsumerFlightPreviewFrame>
  );
}
