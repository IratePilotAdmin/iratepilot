import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";

import { DashboardShell } from "@/components/layout/dashboard-shell";
import { adminNavigation } from "@/data/navigation";
import { requireRole } from "@/lib/auth/require-role";
import { FLIGHT_CONSUMER_PRODUCTION_STRIPE_ACCOUNT_PREFLIGHT_CONFIRMATION } from "@/lib/flights/consumer-production/stripe-runtime.server";

import { ProductionStripeAccountClient } from "./stripe-account-client";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

export const metadata: Metadata = {
  title: "Production Stripe read-only account preflight",
  robots: { index: false, follow: false },
};

const pagePath = "/admin/flights/consumer-production/stripe-account";

export default async function ProductionStripeAccountPreflightPage() {
  if (process.env.VERCEL_ENV !== "production") notFound();
  const authentication = await requireRole(["admin"]);
  if ("error" in authentication) {
    redirect(authentication.status === 401
      ? `/login?next=${encodeURIComponent(pagePath)}`
      : "/account");
  }

  return (
    <DashboardShell title="Production Stripe read-only account preflight" items={adminNavigation}>
      <ProductionStripeAccountClient
        confirmation={FLIGHT_CONSUMER_PRODUCTION_STRIPE_ACCOUNT_PREFLIGHT_CONFIRMATION}
      />
    </DashboardShell>
  );
}
