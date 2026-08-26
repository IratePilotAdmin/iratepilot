import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";

import { DashboardShell } from "@/components/layout/dashboard-shell";
import { adminNavigation } from "@/data/navigation";
import { requireRole } from "@/lib/auth/require-role";
import {
  FLIGHT_CONSUMER_PREVIEW_ACTIVATION_CONFIRMATION,
  FLIGHT_CONSUMER_PREVIEW_RELOCK_CONFIRMATION,
} from "@/lib/flights/consumer-preview/activation-control.server";
import {
  FLIGHT_CONSUMER_PREVIEW_DUFFEL_WEBHOOK_BOOTSTRAP_CONFIRMATION,
  FLIGHT_CONSUMER_PREVIEW_DUFFEL_WEBHOOK_PING_CONFIRMATION,
} from "@/lib/flights/consumer-preview/duffel-webhook-bootstrap.server";
import { FLIGHT_CONSUMER_PREVIEW_REPRICE_RECOVERY_CONFIRMATION } from "@/lib/flights/consumer-preview/reprice-recovery.server";

import { DuffelWebhookBootstrapClient } from "./duffel-webhook-bootstrap-client";
import { TemporaryPreviewActivationClient } from "./preview-activation-client";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

export const metadata: Metadata = {
  title: "Temporary Duffel TEST webhook setup",
  robots: { index: false, follow: false },
};

const pagePath =
  "/admin/flights/consumer-preview/duffel-webhook-bootstrap";
const nativeOperatorEndpoint =
  "/api/admin/flights/consumer-preview/duffel-webhook-bootstrap/native";
const nativeTransport = "NATIVE_OPERATOR_FORM_V1";

function NativeOperatorForm({
  confirmation,
  label,
  operation,
  primary = false,
}: Readonly<{
  confirmation: string;
  label: string;
  operation: "bootstrap" | "ping" | "activate" | "recover_reprice" | "relock";
  primary?: boolean;
}>) {
  return (
    <form
      method="post"
      action={nativeOperatorEndpoint}
      autoComplete="off"
      encType="application/x-www-form-urlencoded"
    >
      <input type="hidden" name="transport" value={nativeTransport} />
      <input type="hidden" name="operation" value={operation} />
      <input type="hidden" name="confirmation" value={confirmation} />
      <button className={primary ? "btn-primary" : "btn-secondary"} type="submit">
        {label}
      </button>
    </form>
  );
}

export default async function TemporaryDuffelWebhookBootstrapPage() {
  if (process.env.VERCEL_ENV !== "preview") notFound();
  const authentication = await requireRole(["admin"]);
  if ("error" in authentication) {
    redirect(authentication.status === 401
      ? `/login?next=${encodeURIComponent(pagePath)}`
      : "/account");
  }

  return (
    <DashboardShell title="Temporary Duffel TEST webhook setup" items={adminNavigation}>
      <DuffelWebhookBootstrapClient />
      <section
        className="mt-8 border border-sky-400 bg-sky-50 p-6"
        aria-labelledby="native-preview-operator-title"
      >
        <p className="text-xs font-semibold uppercase tracking-[.14em] text-sky-900">
          No-JavaScript native operator fallback
        </p>
        <h2 id="native-preview-operator-title" className="mt-2 text-2xl text-neutral-950">
          Run the same guarded operations through browser navigation
        </h2>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-sky-950">
          These server-rendered forms are restricted to this authenticated Preview origin.
          Bootstrap displays the one-time signing secret on the next uncached page; capture
          it once and navigate away immediately.
        </p>
        <div className="mt-5 flex flex-wrap gap-3">
          <NativeOperatorForm
            confirmation={FLIGHT_CONSUMER_PREVIEW_DUFFEL_WEBHOOK_BOOTSTRAP_CONFIRMATION}
            label="Native: Bootstrap one Duffel TEST webhook"
            operation="bootstrap"
            primary
          />
          <NativeOperatorForm
            confirmation={FLIGHT_CONSUMER_PREVIEW_DUFFEL_WEBHOOK_PING_CONFIRMATION}
            label="Native: Ping exact Duffel TEST webhook"
            operation="ping"
          />
          <NativeOperatorForm
            confirmation={FLIGHT_CONSUMER_PREVIEW_ACTIVATION_CONFIRMATION}
            label="Native: Activate Consumer Flight Preview TEST only"
            operation="activate"
            primary
          />
          <NativeOperatorForm
            confirmation={FLIGHT_CONSUMER_PREVIEW_REPRICE_RECOVERY_CONFIRMATION}
            label="Native: Close one terminal TEST reprice without redispatch"
            operation="recover_reprice"
          />
          <NativeOperatorForm
            confirmation={FLIGHT_CONSUMER_PREVIEW_RELOCK_CONFIRMATION}
            label="Native: Relock and stop all test operations"
            operation="relock"
          />
        </div>
      </section>
      <div className="mt-8">
        <TemporaryPreviewActivationClient />
      </div>
    </DashboardShell>
  );
}
