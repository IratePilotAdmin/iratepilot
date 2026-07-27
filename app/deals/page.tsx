import { SiteHeader } from "@/components/layout/site-header";
import { SiteFooter } from "@/components/layout/site-footer";

export default function DealsPage() {
  return <><SiteHeader /><main className="container-page py-16"><div className="rounded-3xl bg-brand-700 p-10 text-white"><span className="badge bg-white/15 text-white">Limited-time offers</span><h1 className="mt-4 text-4xl font-bold">Save up to 20% on selected premium stays</h1><p className="mt-4 max-w-2xl text-brand-100">Member pricing, early-booking offers, and private property promotions.</p></div></main><SiteFooter /></>;
}
