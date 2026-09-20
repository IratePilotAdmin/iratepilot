import type { Metadata } from "next";
import Link from "next/link";
import { PartnerRegistrationForm } from "@/components/forms/partner-registration-form";
import { isPartnerSelfServiceEnabled } from "@/config/partner-acquisition";
import { getSupabasePublicConfig } from "@/lib/supabase/config";
import { readPartnerAcquisitionAttribution } from "@/lib/partner/acquisition";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Register your property", robots: { index: false, follow: false } };

export default async function PartnerRegistrationPage({ searchParams }: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const configured = isPartnerSelfServiceEnabled() && getSupabasePublicConfig().configured;
  const incoming = await searchParams;
  const campaignQuery = new URLSearchParams();
  for (const key of ["utm_source", "utm_medium", "utm_campaign", "utm_content"] as const) {
    const value = incoming[key];
    if (typeof value === "string") campaignQuery.set(key, value);
  }
  const attribution = readPartnerAcquisitionAttribution(campaignQuery.toString());
  return <main className="min-h-screen bg-[#f7f6f3] px-4 py-8 sm:py-14" id="main-content"><div className="mx-auto max-w-3xl">
    <Link href="/partners" className="text-sm underline">Back to the partner program</Link>
    <div className="mt-6 border border-neutral-200 bg-white p-5 sm:p-9">
      <p className="section-kicker">Private property registration</p>
      <h1 className="mt-4 text-3xl sm:text-4xl">Let’s start with your property.</h1>
      <p className="mt-4 text-sm leading-7 text-neutral-600">Register the essential business details, confirm your email, and continue in your saved applicant workspace. This does not grant partner access, publish a listing, or activate bookings.</p>
      <div className="mt-7"><PartnerRegistrationForm configured={configured} attribution={attribution} /></div>
    </div>
    <p className="mt-5 text-sm leading-6 text-neutral-600">13% iRatePilot Group, LLC commission + mandatory 3% iRate Rewards Program contribution = 16% total hotel distribution cost. Traveler service fee: 0%. Management software subscriptions are separate.</p>
  </div></main>;
}
