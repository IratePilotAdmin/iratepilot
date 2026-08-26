import type { ReactNode } from "react";
import Link from "next/link";
import { AlertTriangle, FlaskConical, LockKeyhole, Plane } from "lucide-react";
import { SiteFooter } from "@/components/layout/site-footer";
import { SiteHeader } from "@/components/layout/site-header";

export function ConsumerFlightPreviewFrame({ children }: { children: ReactNode }) {
  return (
    <>
      <SiteHeader />
      <main id="main-content" className="min-h-[70vh] bg-[#f7f6f3]">
        {children}
      </main>
      <SiteFooter />
    </>
  );
}

export function ConsumerFlightPreviewDisclosure({ compact = false }: { compact?: boolean }) {
  return (
    <aside
      aria-label="Flight Preview limitations"
      className={`border border-amber-300 bg-amber-50 text-amber-950 ${compact ? "p-4" : "p-5 sm:p-6"}`}
    >
      <div className="flex items-start gap-3">
        <FlaskConical aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0" />
        <div>
          <strong className="text-sm font-semibold uppercase tracking-[.12em]">Controlled test Preview</strong>
          <p className="mt-2 text-sm leading-6">
            Results use Duffel test inventory and payments use Stripe test mode. Use fictional traveler data only.
            Nothing here is valid travel, a live card charge, or a Production booking.
          </p>
        </div>
      </div>
    </aside>
  );
}

export function ConsumerFlightPreviewUnavailable() {
  return (
    <ConsumerFlightPreviewFrame>
      <section className="container-page py-16 sm:py-24" aria-labelledby="preview-unavailable-title">
        <div className="mx-auto max-w-3xl border border-black bg-white p-8 sm:p-12">
          <span className="section-kicker">Flights · Private Preview</span>
          <AlertTriangle aria-hidden="true" className="mt-8 h-10 w-10" />
          <h1 id="preview-unavailable-title" className="mt-5 text-4xl sm:text-5xl">
            The consumer flight Preview is closed.
          </h1>
          <p className="mt-5 max-w-2xl leading-7 text-neutral-600">
            Its server-side safety gate is off, so no Duffel search, airline order, traveler-data, or Stripe payment
            request can be made from this experience.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link href="/flights" className="btn-primary">
              Return to flight planning
            </Link>
            <Link href="/account" className="btn-secondary">
              Account overview
            </Link>
          </div>
          <div className="mt-8 flex items-start gap-3 border-t border-neutral-200 pt-6 text-sm text-neutral-600">
            <LockKeyhole aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0 text-neutral-900" />
            <p>Preview access is deliberately fail-closed and does not imply consumer Production availability.</p>
          </div>
        </div>
      </section>
    </ConsumerFlightPreviewFrame>
  );
}

export function ConsumerFlightPreviewHeading({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow: string;
  title: string;
  description: string;
  actions?: ReactNode;
}) {
  return (
    <header className="border-b border-neutral-300 bg-[#071b2b] text-white">
      <div className="container-page py-10 sm:py-14">
        <div className="flex flex-col gap-7 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-3xl">
            <span className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[.18em] text-amber-300">
              <Plane aria-hidden="true" className="h-4 w-4" />
              {eyebrow}
            </span>
            <h1 className="mt-4 text-4xl text-white sm:text-5xl">{title}</h1>
            <p className="mt-4 max-w-2xl leading-7 text-slate-300">{description}</p>
          </div>
          {actions ? <div className="flex shrink-0 flex-wrap gap-3">{actions}</div> : null}
        </div>
      </div>
    </header>
  );
}
