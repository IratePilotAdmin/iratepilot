"use client";

import { useCallback, useEffect, useState } from "react";

type HealthConnection = {
  connectionId: string;
  propertyId: string;
  environment: "test";
  enabled: boolean;
  partnerApproved: boolean;
  piiComplianceApproved: boolean;
  reservations: {
    recentCount: number;
    statuses: Record<string, number>;
    latestAt: string | null;
    reviewReasons: Array<{ code: string; count: number }>;
    recentReviewEvents: Array<{ eventKind: string; code: string; receivedAt: string }>;
  };
  availabilityAndRates: {
    recentCount: number;
    statuses: Record<string, number>;
    latestAt: string | null;
    lastHttpStatus: number | null;
  };
};
type HealthResponse = { properties: Array<{ id: string; name: string }>; connections: HealthConnection[]; scope?: string; error?: string };

function when(value: string | null) {
  if (!value) return "No activity yet";
  const date = new Date(value);
  return Number.isFinite(date.valueOf()) ? date.toLocaleString() : "Timestamp unavailable";
}

const REVIEW_GUIDANCE: Record<string, { title: string; action: string }> = {
  payment_treatment_required: { title: "Payment model needs review", action: "Confirm who collects the guest payment and configure that payment flow before importing." },
  currency_not_supported: { title: "Currency needs review", action: "Configure a supported property currency or review this reservation manually." },
  price_breakdown_missing: { title: "Price breakdown is missing", action: "Compare the Booking.com reservation details with the PMS folio before posting charges." },
  guest_total_missing: { title: "Guest total is missing", action: "Verify the reservation total in Booking.com, then correct the folio manually." },
  unknown_charge_type: { title: "Charge type is unrecognized", action: "Identify the charge as a tax or hotel fee in the property setup before importing." },
  exclusive_charge_requires_review: { title: "A charge is collected separately", action: "Confirm collection responsibility and the folio treatment for this property." },
  charges_exceed_guest_total: { title: "Charges exceed the guest total", action: "Check the tax and fee breakdown against the total before importing." },
  hotel_fee_migration_required: { title: "Hotel-fee support is not enabled", action: "Install the approved PMS hotel-fee database migration before enabling imports with hotel fees." },
  pms_connection_missing: { title: "PMS connection is missing", action: "Connect this Booking.com channel to the correct PMS property." },
  credential_or_payload_invalid: { title: "Reservation data could not be verified", action: "Check the channel credentials and have an administrator review the event." },
  provider_event_kind_mismatch: { title: "Reservation event needs review", action: "Compare the event type in Booking.com with the reservation status." },
  multi_room_change_requires_review: { title: "Multi-room change needs review", action: "Review the changed rooms in Booking.com and update the PMS reservation manually." },
  multi_room_cancellation_requires_review: { title: "Multi-room cancellation needs review", action: "Verify all rooms and cancellation terms, then update the PMS manually." },
  pms_signing_secret_invalid: { title: "PMS connection security needs attention", action: "Ask an administrator to verify the signed PMS gateway configuration." },
  pms_review_required: { title: "PMS did not accept the reservation", action: "Open the PMS reservation queue and resolve its validation or inventory issue." },
};

function reviewGuidance(code: string) {
  return REVIEW_GUIDANCE[code] ?? { title: "Administrator review required", action: "Inspect the channel and PMS logs for this event. Guest data is intentionally hidden here." };
}

function Counts({ label, values }: { label: string; values: Record<string, number> }) {
  return <div className="mt-2">
    <p className="text-sm font-semibold">{label}</p>
    <ul className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-slate-600">
      {Object.entries(values).map(([status, count]) => <li key={status}><span className="capitalize">{status}</span>: {count}</li>)}
    </ul>
  </div>;
}

export function PartnerBookingComHealth() {
  const [body, setBody] = useState<HealthResponse | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(true);

  const load = useCallback(async () => {
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/partner/integrations/booking-com/health", { cache: "no-store" });
      const result = await response.json() as HealthResponse;
      if (!response.ok) throw new Error(result.error || "Channel health could not be loaded.");
      setBody(result);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Channel health could not be loaded.");
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    // Initial remote-data synchronization.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  return <section className="card mt-6 p-6" aria-labelledby="booking-com-health-heading">
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div>
        <h2 id="booking-com-health-heading" className="text-xl font-semibold">Booking.com test activity</h2>
        <p className="mt-1 max-w-3xl text-sm text-slate-600">Read-only queue health for your properties. This is test metadata; it does not activate synchronization.</p>
      </div>
      <button className="btn-secondary" type="button" onClick={() => void load()} disabled={busy}>{busy ? "Refreshing…" : "Refresh activity"}</button>
    </div>
    {error && <p className="mt-4 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800" role="alert">{error}</p>}
    {body && body.connections.length === 0 && <p className="mt-4 text-sm text-slate-500">No Booking.com test connections are configured for your properties.</p>}
    {body && body.connections.length > 0 && <div className="mt-5 grid gap-4 lg:grid-cols-2">
      {body.connections.map((connection) => {
        const property = body.properties.find((item) => item.id === connection.propertyId);
        return <article className="rounded-xl border border-slate-200 p-4" key={connection.connectionId}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="font-semibold">{property?.name || "Hotel property"}</h3>
            <span className="badge">Test · {connection.enabled ? "Enabled" : "Disabled"}</span>
          </div>
          <p className="mt-2 text-xs text-slate-500">Partner approval: {connection.partnerApproved ? "approved" : "pending"} · Guest-data review: {connection.piiComplianceApproved ? "approved" : "pending"}</p>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <div>
              <Counts label="Reservation inbox" values={connection.reservations.statuses} />
              <p className="mt-2 text-xs text-slate-500">Latest: {when(connection.reservations.latestAt)}</p>
              {connection.reservations.reviewReasons.length > 0 && <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3" aria-label="Reservations held for review">
                <p className="text-sm font-semibold text-amber-950">Held for review</p>
                <ul className="mt-2 space-y-2">
                  {connection.reservations.reviewReasons.map(({ code, count }) => {
                    const guidance = reviewGuidance(code);
                    return <li className="text-xs text-amber-950" key={code}>
                      <span className="font-semibold">{guidance.title} · {count}</span>
                      <p className="mt-0.5 text-amber-900">{guidance.action}</p>
                    </li>;
                  })}
                </ul>
                <div className="mt-3 border-t border-amber-200 pt-3">
                  <p className="text-xs font-semibold text-amber-950">Recent held events</p>
                  <ul className="mt-2 space-y-2">
                    {connection.reservations.recentReviewEvents.map((event, index) => {
                      const guidance = reviewGuidance(event.code);
                      const eventLabel = event.eventKind === "new" ? "New reservation" : event.eventKind === "modified" ? "Reservation change" : event.eventKind === "cancelled" ? "Cancellation" : "Unclassified event";
                      return <li className="text-xs text-amber-950" key={`${event.receivedAt}-${event.code}-${index}`}>
                        <span className="font-medium">{eventLabel} · {when(event.receivedAt)}</span>
                        <p className="text-amber-900">{guidance.title}</p>
                      </li>;
                    })}
                  </ul>
                </div>
                <p className="mt-2 text-xs text-amber-900">This view explains the hold; it does not approve or post reservations.</p>
              </div>}
            </div>
            <div>
              <Counts label="Rates and availability" values={connection.availabilityAndRates.statuses} />
              <p className="mt-2 text-xs text-slate-500">Latest: {when(connection.availabilityAndRates.latestAt)} · Last HTTP: {connection.availabilityAndRates.lastHttpStatus ?? "—"}</p>
            </div>
          </div>
        </article>;
      })}
    </div>}
    {body?.scope && <p className="mt-4 text-xs text-slate-500">Counts are from the {body.scope.replaceAll("_", " ")}; older queue items may not be included.</p>}
    <p className="mt-3 text-xs text-slate-500">Guest names, contact details, reservation identifiers, and OTA payloads are not shown.</p>
  </section>;
}
