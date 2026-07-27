import { SiteHeader } from "@/components/layout/site-header";
import { SiteFooter } from "@/components/layout/site-footer";
import { CheckoutForm } from "@/components/checkout/checkout-form";

export default function CheckoutPage() {
  return <><SiteHeader /><main className="container-page py-12"><span className="section-kicker">Private pilot</span><h1 className="mt-3 text-4xl">Secure test checkout</h1><p className="mt-3 max-w-2xl text-slate-600">This screen validates the payment integration using Stripe test mode. It cannot accept real money or confirm public inventory.</p><div className="mt-8"><CheckoutForm /></div></main><SiteFooter /></>;
}
