import type { Metadata } from "next";

import { SiteFooter } from "@/components/layout/site-footer";
import { SiteHeader } from "@/components/layout/site-header";

export const metadata: Metadata = {
  title: "Account deletion | iRatePilot",
  description: "Request deletion of your iRatePilot account and eligible personal data.",
};

const deletionEmail =
  "mailto:Support@iratepilot.com?subject=iRatePilot%20account%20deletion%20request&body=Please%20delete%20my%20iRatePilot%20account.%0A%0AAccount%20email%3A%20";

export default function AccountDeletionPage() {
  return (
    <>
      <SiteHeader />
      <main className="container-page max-w-3xl py-16">
        <p className="text-sm font-semibold uppercase tracking-[0.18em] text-violet-700">Privacy request</p>
        <h1 className="mt-3 text-4xl font-bold tracking-tight sm:text-5xl">Delete your iRatePilot account</h1>
        <p className="mt-6 text-lg leading-8 text-neutral-700">
          You can request deletion of your account and eligible personal data from the iRatePilot website or mobile app.
        </p>

        <section className="mt-10 rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm">
          <h2 className="text-2xl font-semibold">How to request deletion</h2>
          <ol className="mt-4 list-decimal space-y-3 pl-6 text-neutral-700">
            <li>Use the email address associated with your iRatePilot account.</li>
            <li>Select the button below and include that account email in your request.</li>
            <li>We may ask you to verify account ownership before completing deletion.</li>
          </ol>
          <a
            className="mt-7 inline-flex rounded-xl bg-violet-700 px-5 py-3 font-semibold text-white hover:bg-violet-800"
            href={deletionEmail}
          >
            Request account deletion
          </a>
          <p className="mt-4 text-sm text-neutral-600">
            If the button does not open your email app, email <a className="underline" href="mailto:Support@iratepilot.com">Support@iratepilot.com</a> with the subject “iRatePilot account deletion request.”
          </p>
        </section>

        <section className="mt-10 space-y-4 text-neutral-700">
          <h2 className="text-2xl font-semibold text-neutral-950">What is deleted</h2>
          <p>
            After ownership verification, we delete or anonymize eligible profile information, authentication access, saved preferences, and notification registrations associated with the account.
          </p>
          <p>
            Reservation, payment, fraud-prevention, tax, and dispute records may be retained only when required for legal, accounting, security, or contractual obligations. Retained records are restricted and removed when the applicable retention requirement ends.
          </p>
          <p>We aim to complete verified requests within 30 days and will contact you if applicable law permits or requires additional time.</p>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
