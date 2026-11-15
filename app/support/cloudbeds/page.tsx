import type { Metadata } from "next";
import Link from "next/link";
import { AlertCircle, CheckCircle2, KeyRound, RefreshCw, ShieldCheck } from "lucide-react";
import { SiteFooter } from "@/components/layout/site-footer";
import { SiteHeader } from "@/components/layout/site-header";

export const metadata: Metadata = {
  title: "Connect Cloudbeds to iRatePilot",
  description:
    "Setup, permissions, troubleshooting, and support guidance for the Cloudbeds integration with iRatePilot.",
};

const connectionSteps = [
  {
    title: "Confirm eligibility",
    text: "Your property must have an active Cloudbeds account and an approved iRatePilot partner profile. Integration access does not activate public bookings by itself.",
  },
  {
    title: "Authorize the property connection",
    text: "A Cloudbeds administrator authorizes iRatePilot for the intended property. In the partner workspace, declare Cloudbeds, enter the non-secret property identifier and mappings, and confirm the hotel owner's approval.",
  },
  {
    title: "Coordinate secure credential setup",
    text: "After Cloudbeds approves the integration, iRatePilot staff coordinate the property-scoped credential exchange through the approved secure channel and run the connection test. Never enter credentials in the partner workspace or send them by email.",
  },
  {
    title: "Complete activation review",
    text: "iRatePilot verifies property mapping, availability, rates, reservation handling, and cancellation behavior before live booking traffic is enabled.",
  },
];

const troubleshooting = [
  [
    "The connection test is rejected",
    "Contact iRatePilot support so an administrator can confirm that the stored credential belongs to the intended Cloudbeds property, has not been replaced, and includes the approved permission scopes.",
  ],
  [
    "The property does not match",
    "Compare the Cloudbeds property ID with the property selected in iRatePilot. Credentials cannot be reused for a different property.",
  ],
  [
    "Rates or availability appear stale",
    "Allow the current synchronization cycle to finish, then run the connection test again. Contact support if the latest Cloudbeds values still do not appear.",
  ],
  [
    "Reservations are not flowing",
    "Check that both the property and the Cloudbeds integration have completed activation review. A successful test connection alone does not enable live reservations.",
  ],
];

export default function CloudbedsSupportPage() {
  return (
    <>
      <SiteHeader />
      <main id="main-content">
        <section className="border-b border-neutral-200 bg-[#f7f6f3]">
          <div className="container-page max-w-5xl py-14 sm:py-20">
            <p className="section-kicker">Property integration support</p>
            <h1 className="mt-4 max-w-3xl text-4xl leading-tight sm:text-6xl">
              Connect Cloudbeds to iRatePilot
            </h1>
            <p className="mt-6 max-w-3xl text-lg leading-8 text-neutral-600">
              Use this guide to prepare, validate, and support a property-scoped Cloudbeds connection.
              Live booking traffic remains disabled until the property and integration both pass activation review.
            </p>
          </div>
        </section>

        <section className="container-page max-w-5xl py-14 sm:py-20" aria-labelledby="connection-steps">
          <div className="flex items-center gap-3">
            <KeyRound aria-hidden="true" className="h-6 w-6" />
            <h2 id="connection-steps" className="text-3xl sm:text-4xl">Connect your property</h2>
          </div>
          <ol className="mt-10 grid gap-8 sm:grid-cols-2">
            {connectionSteps.map((step, index) => (
              <li key={step.title} className="border-t border-neutral-300 pt-5">
                <span className="text-sm text-neutral-500">0{index + 1}</span>
                <h3 className="mt-3 text-lg font-semibold">{step.title}</h3>
                <p className="mt-3 text-sm leading-7 text-neutral-600">{step.text}</p>
              </li>
            ))}
          </ol>
        </section>

        <section className="border-y border-neutral-200 bg-neutral-950 text-white">
          <div className="container-page grid max-w-5xl gap-10 py-14 sm:py-20 lg:grid-cols-2">
            <div>
              <ShieldCheck aria-hidden="true" className="h-6 w-6" />
              <h2 className="mt-5 text-3xl sm:text-4xl">Data and permissions</h2>
              <p className="mt-5 text-sm leading-7 text-neutral-300">
                iRatePilot requests only the Cloudbeds permissions required for the approved workflow. Depending on
                certification and property configuration, this may include hotel, room, rate, currency, guest, and
                reservation data.
              </p>
              <p className="mt-4 text-sm leading-7 text-neutral-300">
                Credentials are property-scoped and are exchanged only through an approved secure channel after
                vendor approval. Partners enter non-secret identifiers and mappings in the workspace; iRatePilot
                administrators store and test credentials. Never send an API key through email or a support message.
              </p>
            </div>
            <div>
              <RefreshCw aria-hidden="true" className="h-6 w-6" />
              <h2 className="mt-5 text-3xl sm:text-4xl">Connection lifecycle</h2>
              <ul className="mt-5 space-y-4 text-sm leading-7 text-neutral-300">
                <li className="flex gap-3"><CheckCircle2 aria-hidden="true" className="mt-1 h-5 w-5 shrink-0" />Validate credentials before activation.</li>
                <li className="flex gap-3"><CheckCircle2 aria-hidden="true" className="mt-1 h-5 w-5 shrink-0" />Review property mapping and booking behavior.</li>
                <li className="flex gap-3"><CheckCircle2 aria-hidden="true" className="mt-1 h-5 w-5 shrink-0" />Replace revoked or expired credentials promptly.</li>
                <li className="flex gap-3"><CheckCircle2 aria-hidden="true" className="mt-1 h-5 w-5 shrink-0" />Request disconnection through iRatePilot support when access should end.</li>
              </ul>
            </div>
          </div>
        </section>

        <section className="container-page max-w-5xl py-14 sm:py-20" aria-labelledby="troubleshooting">
          <div className="flex items-center gap-3">
            <AlertCircle aria-hidden="true" className="h-6 w-6" />
            <h2 id="troubleshooting" className="text-3xl sm:text-4xl">Troubleshooting</h2>
          </div>
          <div className="mt-10 grid gap-8 sm:grid-cols-2">
            {troubleshooting.map(([title, text]) => (
              <article key={title} className="border-t border-neutral-300 pt-5">
                <h3 className="text-lg font-semibold">{title}</h3>
                <p className="mt-3 text-sm leading-7 text-neutral-600">{text}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="border-t border-neutral-200 bg-[#f7f6f3]">
          <div className="container-page max-w-5xl py-14 sm:py-20">
            <h2 className="text-3xl sm:text-4xl">Need help?</h2>
            <p className="mt-5 max-w-2xl text-sm leading-7 text-neutral-600">
              Contact iRatePilot with the property name, Cloudbeds property ID, the time of the issue, and a concise
              description. Do not include API keys, passwords, payment details, or guest personal information.
            </p>
            <Link href="/contact" className="btn-primary mt-7 min-h-12">Contact support</Link>
          </div>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
