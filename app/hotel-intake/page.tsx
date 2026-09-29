import type { Metadata } from "next";
import { CheckCircle2, ClipboardCheck, Clock3, ShieldCheck } from "lucide-react";
import { PartnerApplicationForm } from "@/components/forms/partner-application-form";
import { SiteFooter } from "@/components/layout/site-footer";
import { SiteHeader } from "@/components/layout/site-header";

export const metadata: Metadata = {
  title: "Hotel Manager Intake",
  description: "Submit verified hotel information for private review by iRatePilot.",
};

const steps = [
  { icon: ClipboardCheck, title: "Submit", text: "An authorized manager provides official hotel details and media sources." },
  { icon: ShieldCheck, title: "Verify", text: "iRatePilot confirms authority, content rights, and listing accuracy." },
  { icon: CheckCircle2, title: "Approve", text: "An inactive draft is created. Publication happens only after a separate readiness review." },
];

export default function HotelIntakePage() {
  return (
    <>
      <SiteHeader />
      <main className="bg-[#f7f6f3]">
        <section className="container-page py-14 sm:py-20">
          <div className="mx-auto max-w-5xl">
            <div className="mb-10 max-w-3xl">
              <span className="section-kicker">Private hotel onboarding</span>
              <h1 className="mt-5 text-4xl leading-tight sm:text-6xl">Add your hotel to the iRatePilot review queue.</h1>
              <p className="mt-5 text-lg leading-8 text-neutral-600">
                This secure intake is for hotel owners and authorized managers. It does not create a public listing, accept reservations, or connect to hotel systems.
              </p>
            </div>

            <div className="mb-10 grid gap-4 md:grid-cols-3">
              {steps.map(({ icon: Icon, title, text }, index) => (
                <article key={title} className="rounded-2xl border border-neutral-200 bg-white p-5">
                  <div className="flex items-center gap-3">
                    <span className="grid h-9 w-9 place-items-center rounded-full bg-sky-50 text-sky-700"><Icon className="h-4 w-4" /></span>
                    <strong>{index + 1}. {title}</strong>
                  </div>
                  <p className="mt-3 text-sm leading-6 text-neutral-600">{text}</p>
                </article>
              ))}
            </div>

            <section aria-labelledby="intake-preparation" className="mb-10 rounded-2xl border border-sky-200 bg-sky-50 p-6 sm:p-8">
              <div className="flex items-start gap-4">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-white text-sky-700">
                  <Clock3 className="h-5 w-5" />
                </span>
                <div>
                  <h2 id="intake-preparation" className="text-xl font-semibold text-sky-950">Before you begin</h2>
                  <p className="mt-2 text-sm leading-6 text-sky-950/80">
                    Allow about 10 minutes. Have the hotel&apos;s official website, business address and phone, authorized contact details, a 120-word property description, verified amenities, and an official HTTPS media-library link ready.
                  </p>
                  <p className="mt-2 text-sm leading-6 text-sky-950/80">
                    Do not provide account credentials, guest information, identity documents, or payment and banking details.
                  </p>
                </div>
              </div>
            </section>

            <div className="mx-auto max-w-3xl">
              <PartnerApplicationForm />
            </div>
          </div>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
