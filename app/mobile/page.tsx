import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Check, ShieldCheck, WifiOff } from "lucide-react";
import { SiteFooter } from "@/components/layout/site-footer";
import { SiteHeader } from "@/components/layout/site-header";
import { MobileInstallCard } from "@/components/mobile-install-card";

export const metadata: Metadata = {
  title: "Mobile app",
  description: "Install iRatePilot on your phone for quick access to premium hotel and vacation-home travel.",
};

const benefits = [
  { icon: Check, title: "Home-screen access", copy: "Launch iRatePilot like an app without visiting an app store." },
  { icon: WifiOff, title: "Useful offline fallback", copy: "Get clear guidance when connectivity drops without storing sensitive trip details." },
  { icon: ShieldCheck, title: "Private by design", copy: "Live bookings, accounts, prices, and partner data always require a secure connection." },
];

export default function MobilePage() {
  return (
    <>
      <SiteHeader />
      <main>
        <section className="border-b border-black bg-[#f7f6f3]">
          <div className="container-page grid items-center gap-12 py-16 lg:grid-cols-[1.05fr_.95fr] lg:py-24">
            <div>
              <span className="section-kicker">iRatePilot mobile</span>
              <h1 className="mt-6 max-w-3xl text-5xl leading-[1.02] sm:text-7xl">Premium travel, one tap away.</h1>
              <p className="mt-6 max-w-2xl text-lg leading-8 text-neutral-600">
                Install the iRatePilot web app for quick home-screen access to hotel search, vacation homes, rewards, and your trips.
              </p>
              <Link href="/search" className="mt-8 inline-flex items-center gap-2 border-b border-black pb-1 text-xs font-semibold uppercase tracking-[.12em]">
                Continue in your browser <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
            <MobileInstallCard />
          </div>
        </section>

        <section className="container-page py-20">
          <div className="grid gap-px border border-neutral-300 bg-neutral-300 md:grid-cols-3">
            {benefits.map(({ icon: Icon, title, copy }) => (
              <article key={title} className="bg-white p-7 sm:p-9">
                <Icon className="h-6 w-6" />
                <h2 className="mt-10 text-xl font-semibold">{title}</h2>
                <p className="mt-3 text-sm leading-6 text-neutral-600">{copy}</p>
              </article>
            ))}
          </div>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
