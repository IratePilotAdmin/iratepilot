import { notFound } from "next/navigation";
import { ApprovedBookingCheckout } from "@/components/checkout/approved-booking-checkout";
import { SiteFooter } from "@/components/layout/site-footer";
import { SiteHeader } from "@/components/layout/site-header";
import { getApprovedBookingPaymentMode } from "@/lib/stripe/booking-payment-mode";

type Params = Promise<{ id: string }>;

export default async function ApprovedBookingPaymentPage({ params }: { params: Params }) {
  const { id } = await params;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) notFound();

  const publishableKey = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;
  const paymentMode = getApprovedBookingPaymentMode();
  return <><SiteHeader/><main className="container-page py-12"><span className="section-kicker">Approved reservation</span><h1 className="mt-3 text-4xl">Pay securely{paymentMode === "test" ? " in test mode" : ""}</h1><p className="mt-3 max-w-2xl text-slate-600">Your partner-approved reservation and total are verified again before Stripe {paymentMode === "test" ? "test " : ""}payment.</p><div className="mt-8"><ApprovedBookingCheckout bookingId={id} paymentMode={paymentMode} publishableKey={publishableKey}/></div></main><SiteFooter/></>;
}
