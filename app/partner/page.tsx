import Link from "next/link";
import { ArrowRight, BarChart3, Building2, Check, Headphones, Sparkles } from "lucide-react";
import { SiteHeader } from "@/components/layout/site-header";
import { SiteFooter } from "@/components/layout/site-footer";
import { PartnerApplicationForm } from "@/components/forms/partner-application-form";
import { RevenueAiMarketing } from "@/components/partner/revenue-ai-marketing";
import { partnerEnterprisePlan, partnerPlans, type PartnerPlan } from "@/config/partner-plans";

export default function PartnerPage() {
  return (
    <>
      <SiteHeader />
      <main>
        <section className="partner-hero">
          <div className="container-page grid items-center gap-12 py-20 lg:grid-cols-[.92fr_1.08fr] lg:py-28">
            <div>
              <span className="section-kicker">For premium hotels & vacation homes</span>
              <h1 className="mt-6 text-5xl leading-[1.02] text-white sm:text-7xl">Put your property on the radar.</h1>
              <p className="mt-6 max-w-xl text-lg leading-8 text-neutral-300">
                iRatePilot currently welcomes verified 4- and 5-star hotels and premium vacation homes. Reach more travelers with intelligent tools built for hospitality partners.
              </p>
              <div className="mt-8 flex flex-wrap gap-5 text-sm text-neutral-300">
                <span className="flex items-center gap-2"><Check className="h-4 w-4" /> Premium traveler marketplace</span>
                <span className="flex items-center gap-2"><Check className="h-4 w-4" /> Revenue and operating tools</span>
                <span className="flex items-center gap-2"><Check className="h-4 w-4" /> Human partner support</span>
              </div>
              <a href="#join" className="revenue-primary mt-9">Join as a partner <ArrowRight /></a>
            </div>
            <div id="application" className="scroll-mt-8"><PartnerApplicationForm /></div>
          </div>
        </section>

        <section className="container-page py-24">
          <div className="grid gap-12 lg:grid-cols-[.75fr_1.25fr]">
            <div>
              <span className="section-kicker">iRatePilot Management</span>
              <h2 className="mt-5 text-5xl leading-tight">AI tools that scale with your property.</h2>
              <p className="mt-5 max-w-lg text-lg leading-8 text-neutral-600">
                Monthly software for pricing, operations, and partner support. Marketplace bookings carry a separate 14% partner commission.
              </p>
              <div className="mt-8 grid gap-4">
                <div className="partner-benefit"><Sparkles /><div><strong>AI-assisted pricing</strong><p>Recommendations, forecasting, and manager-controlled decisions.</p></div></div>
                <div className="partner-benefit"><BarChart3 /><div><strong>Performance visibility</strong><p>Booking, pace, revenue, and portfolio insights in one place.</p></div></div>
                <div className="partner-benefit"><Headphones /><div><strong>Partner support</strong><p>Onboarding and operational guidance for your team.</p></div></div>
              </div>
            </div>

            <div className="management-plans">
              {(Object.entries(partnerPlans) as [PartnerPlan, (typeof partnerPlans)[PartnerPlan]][]).map(([, plan]) => (
                <article key={plan.name} className={plan.featured ? "management-plan popular" : "management-plan"}>
                  {plan.featured && <span className="plan-popular">Most popular</span>}
                  <span className="plan-name">{plan.name}</span>
                  <strong>${plan.monthlyPrice}<small>/month</small></strong>
                  <p>{plan.audience}</p>
                  <Link href="#join">Choose {plan.name} <ArrowRight /></Link>
                </article>
              ))}
              <article className="management-plan">
                <span className="plan-name">{partnerEnterprisePlan.name}</span>
                <strong>{partnerEnterprisePlan.monthlyPriceLabel}<small>/month</small></strong>
                <p>{partnerEnterprisePlan.audience}</p>
                <Link href="#join">Contact sales <ArrowRight /></Link>
              </article>
            </div>
          </div>
          <p className="management-disclosure">
            Subscriptions cover iRatePilot Management software. The 14% marketplace commission applies only to completed bookings generated through iRatePilot Travel. Taxes and payment-processing terms may also apply.
          </p>
        </section>

        <RevenueAiMarketing />

        <section className="border-y border-neutral-200 bg-[#f7f6f3]">
          <div className="container-page grid gap-8 py-20 md:grid-cols-3">
            <article className="partner-step"><span>01</span><Building2 /><h3>Create your property profile</h3><p>Add property details, rooms, amenities, policies, rates, inventory, and photos.</p></article>
            <article className="partner-step"><span>02</span><Check /><h3>Complete verification</h3><p>Your listing remains a draft until it is reviewed and approved by iRatePilot.</p></article>
            <article className="partner-step"><span>03</span><Sparkles /><h3>Reach premium travelers</h3><p>Publish approved inventory and use intelligent tools to support pricing and operations.</p></article>
          </div>
        </section>

        <section id="join" className="container-page py-24">
          <div className="partner-join">
            <div><span className="section-kicker text-neutral-400">Partner with us</span><h2 className="mt-4 text-5xl text-white">Ready to grow with iRatePilot?</h2><p className="mt-5 max-w-2xl text-neutral-300">Start your partner application. Approved pilot partners can test subscription and marketplace workflows; live billing and commercial activation still require completed agreements and launch approval.</p></div>
            <Link href="#application" className="revenue-primary">Start partner application <ArrowRight /></Link>
          </div>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
