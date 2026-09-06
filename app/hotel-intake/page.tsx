import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowRight,
  Building2,
  CheckCircle2,
  ClipboardCheck,
  Clock3,
  ShieldCheck,
} from "lucide-react";
import { HotelManagerInterestForm } from "@/components/forms/hotel-manager-interest-form";
import { SiteFooter } from "@/components/layout/site-footer";
import { SiteHeader } from "@/components/layout/site-header";

export const metadata: Metadata = {
  title: "Private Hotel Manager Intake",
  description: "Hotel owners and authorized managers can privately request an iRatePilot onboarding conversation. Intake does not publish a listing or enable bookings.",
};

export const dynamic = "force-dynamic";

const interestSteps = [
  {
    icon: ClipboardCheck,
    title: "Share interest privately",
    text: "Send basic hotel and business-contact details so the team can follow up.",
  },
  {
    icon: ShieldCheck,
    title: "Eligibility conversation",
    text: "iRatePilot discusses the property, representative role, launch scope, and next requirements.",
  },
  {
    icon: Building2,
    title: "Verified application later",
    text: "If the property may be a fit, iRatePilot invites a separate, fuller verification application.",
  },
  {
    icon: CheckCircle2,
    title: "Separate launch decision",
    text: "Agreement, readiness, publication, inventory, payment, and booking approvals remain separate.",
  },
];

const interestPreparationItems = [
  "Hotel or property name and city, state or region, and country",
  "Your name, hotel role, business email, and business phone",
  "Whether you prefer private follow-up by business email or phone",
  "The official hotel website and brief context, if available",
];

export default function HotelIntakePage() {
  const interestIntakeEnabled = process.env.HOTEL_MANAGER_INTEREST_INTAKE_ENABLED === "true";

  return (
    <>
      <SiteHeader />
      <main className="bg-[#f7f6f3]" id="main-content">
        <section className="container-page py-14 sm:py-20">
          <div className="mx-auto max-w-5xl">
            <div className="grid items-start gap-8 lg:grid-cols-[1.2fr_.8fr] lg:gap-12">
              <div>
                <span className="section-kicker">Private hotel manager intake</span>
                <h1 className="mt-5 text-4xl leading-tight sm:text-6xl">
                  Start a private hotel onboarding conversation.
                </h1>
                <p className="mt-5 max-w-3xl text-lg leading-8 text-neutral-600">
                  {interestIntakeEnabled
                      ? "Hotel owners and authorized managers can share basic business contact details for private follow-up. This short interest form is not the verified hotel application and does not publish a listing, enable bookings, collect payment, or connect a hotel system."
                      : "Hotel manager intake is currently paused. No information is being collected here, and no listing, booking, payment, or hotel-system action is available."}
                </p>
                <div className="mt-7 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
                  {interestIntakeEnabled ? (
                    <Link className="btn-primary min-h-12 justify-center sm:justify-start" href="#manager-interest-form">
                      Request private follow-up <ArrowRight className="h-4 w-4" />
                    </Link>
                  ) : (
                    <Link className="btn-primary min-h-12 justify-center sm:justify-start" href="/contact">
                      Contact the team <ArrowRight className="h-4 w-4" />
                    </Link>
                  )}
                  <Link className="btn-secondary min-h-12 justify-center sm:justify-start" href="/partner">
                    Review the partner program
                  </Link>
                </div>
              </div>
              <aside aria-labelledby="intake-boundary" className="rounded-2xl border border-amber-200 bg-amber-50 p-6 text-amber-950 sm:p-7">
                <p className="text-xs font-semibold uppercase tracking-[.16em] text-amber-800">Initial intake only</p>
                <h2 className="mt-2 text-xl font-semibold" id="intake-boundary">What this intake does</h2>
                <ul className="mt-4 grid gap-3 text-sm leading-6">
                  <li className="flex gap-3"><CheckCircle2 aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0" /><span>{interestIntakeEnabled ? "Adds a private outreach lead for an onboarding conversation only." : "Collects no information while interest intake is paused."}</span></li>
                  <li className="flex gap-3"><CheckCircle2 aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0" /><span>Full hotel applications are currently paused.</span></li>
                  <li className="flex gap-3"><ShieldCheck aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0" /><span>Creates no public page, reservation, charge, payout, or supplier connection.</span></li>
                </ul>
              </aside>
            </div>

            <section aria-labelledby="after-submission" className="mt-12 sm:mt-16">
              <div className="max-w-3xl">
                <span className="section-kicker">What happens next</span>
                <h2 className="mt-3 text-3xl font-semibold" id="after-submission">A review sequence with clear stops.</h2>
                <p className="mt-3 leading-7 text-neutral-600">An interest request starts private outreach only. Every later application, onboarding, and commercial action requires its own review.</p>
              </div>
              <div className="mt-7 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {interestSteps.map(({ icon: Icon, title, text }, index) => (
                <article key={title} className="rounded-2xl border border-neutral-200 bg-white p-5">
                  <div className="flex items-center gap-3">
                    <span aria-hidden="true" className="grid h-9 w-9 place-items-center rounded-full bg-sky-50 text-sky-700"><Icon className="h-4 w-4" /></span>
                    <strong>{index + 1}. {title}</strong>
                  </div>
                  <p className="mt-3 text-sm leading-6 text-neutral-600">{text}</p>
                </article>
              ))}
              </div>
            </section>

            {interestIntakeEnabled ? <section aria-labelledby="intake-preparation" className="my-10 rounded-2xl border border-sky-200 bg-sky-50 p-6 sm:my-12 sm:p-8">
              <div className="flex items-start gap-4">
                <span aria-hidden="true" className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-white text-sky-700">
                  <Clock3 className="h-5 w-5" />
                </span>
                <div>
                  <h2 id="intake-preparation" className="text-xl font-semibold text-sky-950">Before you begin</h2>
                  <p className="mt-2 text-sm leading-6 text-sky-950/80">
                    Allow about 3 minutes. Have these business details ready:
                  </p>
                  <ul className="mt-3 grid gap-2 text-sm leading-6 text-sky-950/80 sm:grid-cols-2">
                    {interestPreparationItems.map((item) => <li className="flex gap-2" key={item}><span aria-hidden="true">•</span><span>{item}</span></li>)}
                  </ul>
                  <p className="mt-4 text-sm font-medium leading-6 text-sky-950">
                    Do not provide account credentials, guest information, identity documents, or payment and banking details.
                  </p>
                  <p className="mt-2 text-sm leading-6 text-sky-950/80">
                    Room types, rates, availability, and hotel-system credentials are not part of this initial intake. If the property advances, those are handled later in protected partner onboarding.
                  </p>
                </div>
              </div>
            </section> : null}

            <div className="mx-auto max-w-3xl">
              {interestIntakeEnabled ? (
                <HotelManagerInterestForm />
              ) : (
                <section aria-labelledby="intake-unavailable" className="card p-6 sm:p-8">
                  <p className="text-xs font-semibold uppercase tracking-[.18em] text-amber-700">Intake paused</p>
                  <h2 className="mt-2 text-2xl font-bold" id="intake-unavailable">Hotel manager intake is not accepting submissions right now.</h2>
                  <p className="mt-3 text-sm leading-6 text-slate-600">No information was collected. You can contact the team with a general partnership question or return when the private intake is reopened.</p>
                  <Link className="btn-secondary mt-6 inline-flex min-h-12 items-center" href="/contact">Contact iRatePilot</Link>
                </section>
              )}
            </div>
          </div>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
