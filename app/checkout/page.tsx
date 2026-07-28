import { SiteHeader } from "@/components/layout/site-header";
import { SiteFooter } from "@/components/layout/site-footer";
import { CheckoutForm } from "@/components/checkout/checkout-form";

export const dynamic = "force-dynamic";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function CheckoutPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const publishableKey = process.env["NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY"];
  const enabled = process.env.ENABLE_TEST_CHECKOUT === "true";
  const selection = {
    hotelSlug: typeof params.hotelSlug === "string" ? params.hotelSlug : "",
    roomId: typeof params.roomId === "string" ? params.roomId : "",
    checkIn: typeof params.checkIn === "string" ? params.checkIn : "",
    checkOut: typeof params.checkOut === "string" ? params.checkOut : "",
    guests: typeof params.guests === "string" ? params.guests : ""
  };

  return <><SiteHeader /><main className="container-page py-12"><span className="section-kicker">Private pilot</span><h1 className="mt-3 text-4xl">Secure test checkout</h1><p className="mt-3 max-w-2xl text-slate-600">Your selected room, dates, availability, and total are verified before Stripe test payment.</p><div className="mt-8"><CheckoutForm publishableKey={publishableKey} enabled={enabled} selection={selection} /></div></main><SiteFooter /></>;
}
