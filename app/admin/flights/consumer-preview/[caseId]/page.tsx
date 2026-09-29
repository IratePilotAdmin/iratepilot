import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ShieldAlert } from "lucide-react";

import { DashboardShell } from "@/components/layout/dashboard-shell";
import { adminNavigation } from "@/data/navigation";
import { requireRole } from "@/lib/auth/require-role";
import {
  getFlightConsumerPreviewAdminReconciliationCase,
  type FlightConsumerPreviewAdminRpcClient,
} from "@/lib/flights/consumer-preview/admin-reconciliation.server";
import { FlightConsumerPreviewReconciliationActions } from "../reconciliation-actions";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Flight reconciliation case",
  robots: { index: false, follow: false },
};

type Params = Promise<{ caseId: string }>;

function words(value: string | null) {
  return value ? value.replaceAll("_", " ") : "Not recorded";
}

function shortDigest(value: string | null) {
  return value ? `${value.slice(0, 12)}…${value.slice(-12)}` : "Not recorded";
}

function money(value: number | null) {
  return value === null ? "Not recorded" : `$${(value / 100).toFixed(2)} USD`;
}

export default async function FlightConsumerPreviewReconciliationDetailPage({ params }: { params: Params }) {
  const authentication = await requireRole(["admin"]);
  if ("error" in authentication) {
    redirect(authentication.status === 401 ? "/login?next=%2Fadmin%2Fflights%2Fconsumer-preview" : "/account");
  }
  const { caseId } = await params;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(caseId)) notFound();
  let detail: Awaited<ReturnType<typeof getFlightConsumerPreviewAdminReconciliationCase>> = null;
  try {
    detail = await getFlightConsumerPreviewAdminReconciliationCase(
      authentication.supabase as unknown as FlightConsumerPreviewAdminRpcClient,
      caseId,
    );
  } catch {
    detail = null;
  }
  if (!detail) notFound();

  const evidence = [
    ["Expected state", detail.expectedStateSha256],
    ["Observed state", detail.observedStateSha256],
    ["Target state", detail.targetStateSha256],
    ["Resolution evidence", detail.resolutionEvidenceSha256],
  ] as const;
  return (
    <DashboardShell title={`Flight reconciliation · ${detail.confirmationCode}`} items={adminNavigation}>
      <div className="space-y-7">
        <Link href="/admin/flights/consumer-preview" className="text-sm font-semibold underline">← Reconciliation queue</Link>
        <section className="border border-black bg-white p-7 sm:p-9">
          <div className="flex items-start gap-4"><ShieldAlert className="mt-1 h-7 w-7 text-amber-700" aria-hidden="true" /><div><span className="text-xs font-semibold uppercase tracking-[.14em] text-neutral-500">{words(detail.status)}</span><h1 className="mt-3 text-4xl">{detail.confirmationCode}</h1><p className="mt-3 text-neutral-600">{words(detail.caseType)} · source {words(detail.sourceStatus)} · target {words(detail.targetStatus)}</p></div></div>
          <dl className="mt-8 grid gap-px border border-neutral-300 bg-neutral-300 sm:grid-cols-2 lg:grid-cols-4">
            {[["Order", detail.orderStatus], ["Payment", detail.paymentStatus], ["Provider attempt", detail.providerAttemptState], ["Refund attempt", detail.refundAttemptState]].map(([label, value]) => <div key={label} className="bg-white p-4"><dt className="text-xs uppercase tracking-[.1em] text-neutral-500">{label}</dt><dd className="mt-2 font-semibold capitalize">{words(value)}</dd></div>)}
          </dl>
          <dl className="mt-6 grid gap-4 text-sm sm:grid-cols-3"><div><dt className="text-neutral-500">Authorized</dt><dd className="mt-1 font-semibold">{money(detail.authorizedCents)}</dd></div><div><dt className="text-neutral-500">Captured</dt><dd className="mt-1 font-semibold">{money(detail.capturedCents)}</dd></div><div><dt className="text-neutral-500">Refunded</dt><dd className="mt-1 font-semibold">{money(detail.refundedCents)}</dd></div></dl>
        </section>

        <section className="border border-neutral-300 bg-neutral-50 p-6">
          <h2 className="text-2xl">Immutable evidence digests</h2>
          <dl className="mt-5 grid gap-4 sm:grid-cols-2">{evidence.map(([label, value]) => <div key={label}><dt className="text-xs uppercase tracking-[.1em] text-neutral-500">{label}</dt><dd className="mt-1 break-all font-mono text-sm" title={value ?? undefined}>{shortDigest(value)}</dd></div>)}</dl>
          <p className="mt-5 text-xs leading-5 text-neutral-500">No card data, traveler data, provider references, signing secrets, or encrypted payloads are exposed by this page.</p>
        </section>

        <FlightConsumerPreviewReconciliationActions caseId={detail.caseId} expectedUpdatedAt={detail.updatedAt} status={detail.status} resolutionCode={detail.resolutionCode} />
      </div>
    </DashboardShell>
  );
}
