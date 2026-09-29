import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";

import { DashboardShell } from "@/components/layout/dashboard-shell";
import { adminNavigation } from "@/data/navigation";
import { requireRole } from "@/lib/auth/require-role";

import { ProductionDuffelLiveShoppingClient } from "./live-search-client";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

export const metadata: Metadata = {
  title: "Production Duffel live-shopping dark diagnostic",
  robots: { index: false, follow: false },
};

const pagePath = "/admin/flights/consumer-production/live-search";

export default async function ProductionDuffelLiveShoppingDiagnosticPage() {
  if (process.env.VERCEL_ENV !== "production") notFound();
  const authentication = await requireRole(["admin"]);
  if ("error" in authentication) {
    redirect(authentication.status === 401
      ? `/login?next=${encodeURIComponent(pagePath)}`
      : "/account");
  }

  return (
    <DashboardShell title="Production Duffel live-shopping diagnostic" items={adminNavigation}>
      <ProductionDuffelLiveShoppingClient />
    </DashboardShell>
  );
}
