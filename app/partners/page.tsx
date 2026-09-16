import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Building2, CheckCircle2, ShieldCheck, Sparkles } from "lucide-react";
import { SiteHeader } from "@/components/layout/site-header";
import { SiteFooter } from "@/components/layout/site-footer";
import { isPartnerSelfServiceEnabled } from "@/config/partner-acquisition";
import { publicPartnerEnterprisePlan, publicPartnerPlans } from "@/config/public-partner-plans";
import { getSupabasePublicConfig } from "@/lib/supabase/config";

export const dynamic = "force-dynamic";
export function generateMetadata(): Metadata {
  const enabled = isPartnerSelfServiceEnabled() && getSupabasePublicConfig().configured;
  return {
    title: "List your property with iRatePilot",
    description: "Prepare your hotel application with transparent distribution pricing and a private, saved onboarding workspace.",
    ...(!enabled ? { robots: { index: false, follow: false } } : {}),
  };
}

const steps = [
  ["Create your account", "Share your business contact details and confirm your email."],
  ["Build your property profile", "Save the essential property, location, and representative information at your own pace."],
  ["Submit for review", "Send your completed initial application to the iRatePilot review team."],
  ["Complete verification", "We independently review the property, your authority, and content rights."],
  ["Prepare to go live", "After review, complete rooms, rates, photos, agreements, and connectivity with the team."],
  ["Activate your property", "A separate readiness and publication decision is required before your property can receive bookings."],
];

export default function PartnersPage() {
  const enabled = isPartnerSelfServiceEnabled() && getSupabasePublicConfig().configured;
  return <>
    <SiteHeader />
    <main id="main-content">
      <section className="bg-neutral-950 text-white">
        <div className="container-page grid gap-12 py-16 sm:py-24 lg:grid-cols-[1.2fr_.8fr] lg:items-center">
          <div>
            <p className="section-kicker text-neutral-400">For verified 4- and 5-star properties</p>
            <h1 className="mt-5 max-w-3xl text-4xl leading-tight sm:text-6xl">Grow Your Hotel Business with iRatePilot.</h1>
            <p className="mt-6 max-w-2xl text-lg leading-8 text-neutral-300">Reach travelers through a modern travel marketplace with transparent distribution pricing, integrated rewards, and self-service hotel management.</p>
            <p className="mt-5 max-w-2xl text-sm leading-6 text-neutral-400">We are preparing a carefully verified partner network. An application starts private review; it does not publish your property or enable bookings.</p>
            <div className="mt-8 flex flex-wrap gap-3"><Link href="/partners/register" className="revenue-primary min-h-12">List your property <ArrowRight aria-hidden="true" /></Link><Link href="#partner-process" className="revenue-secondary min-h-12">Learn how it works</Link></div>
            <p className="mt-4 text-sm text-neutral-300">{enabled ? "Start with a short registration, then save and return to your application." : "Partner recruitment is not yet open. Explore the process and pricing below."}</p>
            <p className="mt-3 text-sm text-neutral-300"><Link href="/login?next=%2Fpartner%2Fdashboard%3Fsetup%3D1" className="underline underline-offset-4">Returning applicant? Sign in to continue</Link></p>
          </div>
          <aside className="border border-white/20 p-6 sm:p-8" aria-label="Hotel distribution pricing">
            <p className="text-xs uppercase tracking-[.16em] text-neutral-400">Transparent hotel distribution pricing</p>
            <div className="mt-6 grid gap-6">
              <div className="flex items-baseline justify-between gap-4"><span>iRatePilot Group, LLC commission</span><strong className="text-4xl">13%</strong></div>
              <div className="flex items-baseline justify-between gap-4"><span>iRate Rewards Program contribution</span><strong className="text-4xl">3%</strong></div>
              <div className="flex items-baseline justify-between gap-4 border-t border-white/20 pt-6"><span className="font-semibold">Total hotel distribution cost</span><strong className="text-5xl">16%</strong></div>
            </div>
            <p className="mt-6 text-sm leading-6 text-neutral-300">The 3% rewards contribution is mandatory and separate from commission. Traveler service fee: 0%. Taxes and payment-processing terms may apply. Management software subscriptions are separate.</p>
          </aside>
        </div>
      </section>

      <section className="container-page py-16 sm:py-20" aria-labelledby="partner-benefits">
        <p className="section-kicker">A clear path from application to activation</p>
        <h2 id="partner-benefits" className="mt-4 max-w-3xl text-3xl sm:text-4xl">Your property. Your information. A review you can follow.</h2>
        <div className="mt-9 grid gap-8 md:grid-cols-3">
          {[
            { icon: Building2, title: "A saved application", text: "Create a private property profile and return to your saved progress after signing in, including from another device." },
            { icon: ShieldCheck, title: "Verified participation", text: "Property eligibility, representative authority, and content rights are reviewed before access or publication is approved." },
            { icon: CheckCircle2, title: "Clear commercial terms", text: "Understand the 13% commission and mandatory 3% rewards contribution before submitting your initial application." },
          ].map(({ icon: Icon, title, text }) => <article key={title} className="border-t border-neutral-300 pt-6"><Icon aria-hidden="true" className="h-6 w-6" /><h3 className="mt-4 text-lg font-semibold">{title}</h3><p className="mt-3 text-sm leading-7 text-neutral-600">{text}</p></article>)}
        </div>
      </section>

      <section className="border-y border-neutral-200 bg-[#f7f6f3]" aria-labelledby="partner-process">
        <div className="container-page py-16 sm:py-20">
          <p className="section-kicker">Six steps, with review before activation</p>
          <h2 id="partner-process" className="mt-4 text-3xl sm:text-4xl">How partnering works</h2>
          <ol className="mt-10 grid gap-8 sm:grid-cols-2 lg:grid-cols-3">{steps.map(([title, description], index) => <li key={title} className="border-t border-neutral-300 pt-5"><span className="text-sm text-neutral-500">0{index + 1}</span><h3 className="mt-3 text-lg font-semibold">{title}</h3><p className="mt-3 text-sm leading-7 text-neutral-600">{description}</p></li>)}</ol>
        </div>
      </section>

      <section className="container-page py-16 sm:py-20" aria-labelledby="management-software-plans">
        <p className="section-kicker">Separate software subscription pricing</p>
        <h2 id="management-software-plans" className="mt-4 text-3xl sm:text-4xl">Management software plans</h2>
        <p className="mt-5 max-w-3xl text-sm leading-7 text-neutral-600">These published monthly software prices are separate from the 13% commission and mandatory 3% rewards contribution on hotel distribution. Applying does not start a software subscription. Availability, included tools, and subscription terms are confirmed separately before activation.</p>
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Object.values(publicPartnerPlans).map((plan) => <article key={plan.name} className="border border-neutral-200 p-6"><h3 className="text-lg font-semibold">{plan.name}</h3><p className="mt-4"><strong className="text-3xl">${plan.monthlyPrice}</strong><span className="ml-2 text-sm text-neutral-600">/ month</span></p><p className="mt-4 text-sm leading-6 text-neutral-600">{plan.audience}</p></article>)}
          <article className="border border-neutral-200 p-6"><h3 className="text-lg font-semibold">{publicPartnerEnterprisePlan.name}</h3><p className="mt-4"><strong className="text-3xl">{publicPartnerEnterprisePlan.monthlyPriceLabel}</strong><span className="ml-2 text-sm text-neutral-600">/ month</span></p><p className="mt-4 text-sm leading-6 text-neutral-600">{publicPartnerEnterprisePlan.audience}</p></article>
        </div>
      </section>

      <section id="join" className="container-page grid gap-10 py-16 sm:py-20 lg:grid-cols-2">
        <div><Sparkles aria-hidden="true" className="h-6 w-6" /><p className="section-kicker mt-5">Planned management tools</p><h2 className="mt-4 text-3xl sm:text-4xl">Intelligence for your next chapter.</h2><p className="mt-5 text-base leading-8 text-neutral-600">AI-assisted pricing, forecasting, and operating insights are planned capabilities. They are not available through this application flow, and no revenue improvement or booking volume is guaranteed.</p></div>
        <div id="application" className="border border-neutral-200 p-6 sm:p-8"><h2 className="text-3xl">Prepare your property for review.</h2><p className="mt-4 text-sm leading-7 text-neutral-600">Eligibility remains limited to verified 4- and 5-star properties. Register your hotel, resort, or vacation home and provide accurate business information. Full photo galleries, room inventory, signed agreements, and system connections come in the next stage after review.</p><Link href="/partners/register" className="btn-primary mt-6 min-h-12">List your property <ArrowRight aria-hidden="true" className="ml-3 h-4 w-4" /></Link><p className="mt-4 text-sm"><Link href="/login?next=%2Fpartner%2Fdashboard%3Fsetup%3D1" className="underline">Already started? Sign in to continue</Link></p></div>
      </section>
    </main>
    <SiteFooter />
  </>;
}
