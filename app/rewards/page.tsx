import Link from "next/link";
import { SiteHeader } from "@/components/layout/site-header";
import { SiteFooter } from "@/components/layout/site-footer";
import { memberships, type MembershipTier } from "@/config/memberships";

export default function RewardsPage() {
  return <><SiteHeader /><main className="container-page py-16">
    <span className="section-kicker">Membership & rewards</span><h1 className="mt-4 text-4xl font-bold">Save more and earn faster on every eligible stay.</h1><p className="mt-3 max-w-2xl text-slate-600">Every traveler pays a 0% traveler service fee. Active Basic members receive an extra 5% discount and 2× iRate Rewards points; Business members receive an extra 10% discount and 3× points.</p>
    <section className="mt-10 grid gap-6 md:grid-cols-2">{(Object.entries(memberships) as [MembershipTier,(typeof memberships)[MembershipTier]][]).map(([tier,plan])=><article className="card p-7" key={tier}><span className="text-sm font-semibold text-brand-700">{plan.name}</span><h2 className="mt-3 text-4xl font-bold">${plan.annualPrice}<small className="text-base font-medium text-slate-500"> / year</small></h2><ul className="mt-6 grid gap-3 text-sm text-slate-600">{plan.benefits.map((benefit)=><li key={benefit}>✓ {benefit}</li>)}</ul><Link href="/account/rewards" className="btn-primary mt-7">Manage membership</Link></article>)}</section>
    <section className="card mt-8 p-7"><h2 className="text-xl font-bold">How booking value is calculated</h2><div className="mt-5 grid gap-5 md:grid-cols-3"><div><strong>Verified nightly rates</strong><p className="mt-1 text-sm text-slate-500">Properties publish dated room inventory. Eligible member discounts are applied to the verified room subtotal.</p></div><div><strong>No traveler fee</strong><p className="mt-1 text-sm text-slate-500">The traveler service fee is $0 for members and non-members.</p></div><div><strong>Member value</strong><p className="mt-1 text-sm text-slate-500">Basic saves an extra 5% and earns 2× points. Business saves an extra 10% and earns 3× points.</p></div></div><p className="mt-6 border-t pt-5 text-xs text-slate-500">Membership checkout and payment flows currently operate in Stripe test mode. Benefits require an active subscription status.</p></section>
  </main><SiteFooter /></>;
}
