import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AlertTriangle, CheckCircle2, Clock3, Headphones, ShieldCheck } from "lucide-react";

import { DashboardShell } from "@/components/layout/dashboard-shell";
import { adminNavigation } from "@/data/navigation";
import { requireRole } from "@/lib/auth/require-role";
import {
  listFlightConsumerPreviewAdminReconciliationCases,
  type FlightConsumerPreviewAdminRpcClient,
} from "@/lib/flights/consumer-preview/admin-reconciliation.server";
import {
  flightConsumerPreviewServiceRequestReasonLabel,
  flightConsumerPreviewServiceRequestTypeLabel,
} from "@/lib/flights/consumer-preview/service-request-contract";
import {
  listFlightConsumerPreviewAdminServiceRequests,
  type FlightConsumerPreviewServiceRequestRpcClient,
} from "@/lib/flights/consumer-preview/service-requests.server";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Flight Consumer Preview reconciliation",
  robots: { index: false, follow: false },
};

type SearchParams = Promise<{ status?: string }>;

function badge(status: string) {
  if (status === "resolved") return "border-emerald-300 bg-emerald-50 text-emerald-900";
  if (status === "blocked") return "border-red-300 bg-red-50 text-red-900";
  if (status === "investigating") return "border-sky-300 bg-sky-50 text-sky-900";
  return "border-amber-300 bg-amber-50 text-amber-950";
}

export default async function FlightConsumerPreviewReconciliationPage({ searchParams }: { searchParams: SearchParams }) {
  const authentication = await requireRole(["admin"]);
  if ("error" in authentication) {
    redirect(authentication.status === 401
      ? "/login?next=%2Fadmin%2Fflights%2Fconsumer-preview"
      : "/account");
  }
  const query = await searchParams;
  const allowed = new Set(["open", "investigating", "blocked", "resolved"]);
  const status = query.status && allowed.has(query.status) ? query.status : null;
  let cases: Awaited<ReturnType<typeof listFlightConsumerPreviewAdminReconciliationCases>> = [];
  let unavailable = false;
  try {
    cases = await listFlightConsumerPreviewAdminReconciliationCases(
      authentication.supabase as unknown as FlightConsumerPreviewAdminRpcClient,
      { limit: 100, status },
    );
  } catch {
    unavailable = true;
  }
  let serviceRequests: Awaited<ReturnType<typeof listFlightConsumerPreviewAdminServiceRequests>> = [];
  let serviceRequestsUnavailable = false;
  try {
    serviceRequests = await listFlightConsumerPreviewAdminServiceRequests(
      authentication.supabase as unknown as FlightConsumerPreviewServiceRequestRpcClient,
      { limit: 100 },
    );
  } catch {
    serviceRequestsUnavailable = true;
  }

  return (
    <DashboardShell title="Flight Consumer Preview reconciliation" items={adminNavigation}>
      <div className="space-y-7">
        <section className="border border-black bg-[#071b2b] p-7 text-white sm:p-9">
          <div className="flex items-start gap-4"><ShieldCheck className="mt-1 h-7 w-7 text-amber-300" aria-hidden="true" /><div><span className="text-xs font-semibold uppercase tracking-[.14em] text-amber-300">Preview / test only</span><h1 className="mt-3 text-4xl text-white">Reconcile durable evidence, never browser claims.</h1><p className="mt-4 max-w-3xl leading-7 text-slate-300">This queue exposes sanitized order, payment, provider-attempt, and refund states. Webhooks remain signal-only and this console cannot retry a Duffel order.</p></div></div>
        </section>

        <section className="border border-neutral-300 bg-white p-6 sm:p-8" aria-labelledby="test-support-queue-title">
          <div className="flex items-start gap-4"><Headphones className="mt-1 h-7 w-7" aria-hidden="true" /><div><span className="text-xs font-semibold uppercase tracking-[.14em] text-neutral-500">Local support intake</span><h2 id="test-support-queue-title" className="mt-2 text-3xl">Consumer Preview request review</h2><p className="mt-3 max-w-3xl text-sm leading-6 text-neutral-600">These bounded owner requests are visible for staff review only. This queue has no provider-servicing dispatch, ticket mutation, cancellation, refund, or live-operation action.</p></div></div>
          {serviceRequestsUnavailable ? (
            <div className="mt-6 border border-red-300 bg-red-50 p-5 text-sm text-red-950" role="alert">The local support request ledger is unavailable. No servicing outcome was inferred.</div>
          ) : serviceRequests.length === 0 ? (
            <p className="mt-6 border border-dashed border-neutral-300 p-5 text-sm text-neutral-600">No Consumer Preview support requests are waiting in the durable ledger.</p>
          ) : (
            <div className="mt-6 grid gap-3">
              {serviceRequests.map((request) => (
                <article key={request.id} className="border border-neutral-300 bg-neutral-50 p-5">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div><span className="text-xs font-semibold uppercase tracking-[.12em] text-neutral-500">{request.confirmationCode}</span><h3 className="mt-2 text-xl capitalize">{flightConsumerPreviewServiceRequestTypeLabel(request.requestType)}</h3><p className="mt-2 text-sm text-neutral-600">{flightConsumerPreviewServiceRequestReasonLabel(request.requestType, request.reasonCode)} · order {request.orderStatus.replaceAll("_", " ")}</p></div>
                    <div className="text-sm sm:text-right"><span className="inline-flex border border-neutral-300 bg-white px-2 py-1 text-xs font-semibold uppercase tracking-[.1em]">{request.status.replaceAll("_", " ")}</span><p className="mt-2 text-neutral-500"><time dateTime={request.createdAt}>{new Date(request.createdAt).toLocaleString("en-US", { timeZone: "UTC", timeZoneName: "short" })}</time></p></div>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>

        <nav className="flex flex-wrap gap-2" aria-label="Reconciliation filters">
          {[[null, "All"], ["open", "Open"], ["investigating", "Investigating"], ["blocked", "Blocked"], ["resolved", "Resolved"]].map(([value, label]) => (
            <Link key={label} href={value ? `/admin/flights/consumer-preview?status=${value}` : "/admin/flights/consumer-preview"} className={`border px-4 py-2 text-sm font-semibold ${(status ?? null) === value ? "border-black bg-black text-white" : "border-neutral-300 bg-white text-neutral-800"}`}>{label}</Link>
          ))}
        </nav>

        {unavailable ? (
          <div className="border border-red-300 bg-red-50 p-6 text-red-950" role="alert"><AlertTriangle className="h-6 w-6" aria-hidden="true" /><h2 className="mt-3 text-xl">The reconciliation ledger is unavailable.</h2><p className="mt-2 text-sm leading-6">No operational inference was made. Verify the Preview runtime authority and scoped database RPC before taking action.</p></div>
        ) : cases.length === 0 ? (
          <div className="border border-emerald-300 bg-emerald-50 p-7"><CheckCircle2 className="h-7 w-7 text-emerald-800" aria-hidden="true" /><h2 className="mt-3 text-2xl">No matching reconciliation cases.</h2><p className="mt-2 text-sm text-emerald-950">The selected durable queue is empty.</p></div>
        ) : (
          <div className="grid gap-4">
            {cases.map((item) => (
              <article key={item.caseId} className="border border-neutral-300 bg-white p-6">
                <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
                  <div><span className={`inline-flex border px-2.5 py-1 text-xs font-semibold uppercase tracking-[.1em] ${badge(item.status)}`}>{item.status}</span><h2 className="mt-3 text-2xl">{item.confirmationCode}</h2><p className="mt-2 text-sm text-neutral-600">{item.caseType.replaceAll("_", " ")} · order {item.orderStatus.replaceAll("_", " ")} · payment {(item.paymentStatus ?? "not recorded").replaceAll("_", " ")}</p></div>
                  <div className="text-sm text-neutral-600 sm:text-right"><Clock3 className="mb-2 inline h-4 w-4" aria-hidden="true" /><p>Updated <time dateTime={item.updatedAt}>{new Date(item.updatedAt).toLocaleString("en-US", { timeZone: "UTC", timeZoneName: "short" })}</time></p><p className="mt-1">Tickets: {item.ticketCount}</p></div>
                </div>
                <Link className="btn-secondary mt-5" href={`/admin/flights/consumer-preview/${encodeURIComponent(item.caseId)}`}>Review durable case</Link>
              </article>
            ))}
          </div>
        )}
      </div>
    </DashboardShell>
  );
}
