"use client";

import { useCallback, useEffect, useState } from "react";

type ExternalProvider = {
  id: string;
  status: "development_only" | "not_implemented" | string;
  implemented: string[];
  missing: string[];
};

type Capabilities = {
  nativePmsAri: {
    implementation: string;
    trafficEnabled: boolean;
    activationRequires: string[];
  };
  externalOtaProviders: {
    status: string;
    providers: ExternalProvider[];
  };
};

const providerNames: Record<string, string> = {
  booking_com: "Booking.com",
  expedia: "Expedia Group",
  agoda: "Agoda",
  airbnb: "Airbnb",
  google_hotel: "Google Hotels",
};

function label(value: string) {
  return value.replaceAll("_", " ").replace(/^\w/, (letter) => letter.toUpperCase());
}

export function PartnerOtaDistribution() {
  const [capabilities, setCapabilities] = useState<Capabilities | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/ota/capabilities", { cache: "no-store" });
      if (!response.ok) throw new Error("Channel status could not be loaded.");
      const body = await response.json() as Capabilities;
      if (!body.nativePmsAri || !Array.isArray(body.externalOtaProviders?.providers)) {
        throw new Error("Channel status response was incomplete.");
      }
      setCapabilities(body);
    } catch {
      setError("Channel status could not be loaded. Retry to check the latest connection readiness.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // Initial remote-data synchronization.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  function refresh() {
    setLoading(true);
    setError("");
    void load();
  }

  return <section className="card mt-8 p-6" aria-labelledby="ota-distribution-heading">
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div>
        <h2 id="ota-distribution-heading" className="text-xl font-semibold">Channel distribution</h2>
        <p className="mt-1 max-w-3xl text-sm text-slate-600">
          See which booking channels are connected, under development, or still need partner approval. Status comes from the live capability endpoint.
        </p>
      </div>
      <button className="btn-secondary" type="button" onClick={refresh} disabled={loading}>
        {loading ? "Checking…" : "Refresh status"}
      </button>
    </div>

    {error && <div role="alert" className="mt-5 rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">
      <p>{error}</p>
      <button className="mt-2 font-semibold underline" type="button" onClick={refresh} disabled={loading}>Retry</button>
    </div>}

    {capabilities && <>
      <div className="mt-6 rounded-xl border border-amber-200 bg-amber-50 p-4">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="font-semibold">iRatePilot.com</h3>
          <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${capabilities.nativePmsAri.trafficEnabled ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-900"}`}>
            {capabilities.nativePmsAri.trafficEnabled ? "Receiver flag on" : "Built; traffic disabled"}
          </span>
        </div>
        <p className="mt-2 text-sm text-slate-700">
          The native PMS availability and rate receiver is implemented. Live distribution still requires an approved property mapping and a successful sandbox round trip.
        </p>
        {capabilities.nativePmsAri.activationRequires.length > 0 && <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-slate-600">
          {capabilities.nativePmsAri.activationRequires.map((requirement) => <li key={requirement}>{label(requirement)}</li>)}
        </ul>}
      </div>

      <div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {capabilities.externalOtaProviders.providers.map((provider) => {
          const developmentOnly = provider.status === "development_only";
          const enabled = provider.status === "connected" || provider.status === "production";
          const inCertification = provider.status === "sandbox" || provider.status === "certification_pending";
          return <article className="rounded-xl border border-slate-200 p-4" key={provider.id}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="font-semibold">{providerNames[provider.id] || label(provider.id)}</h3>
              <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${enabled ? "bg-emerald-100 text-emerald-800" : inCertification ? "bg-sky-100 text-sky-800" : developmentOnly ? "bg-amber-100 text-amber-900" : "bg-slate-100 text-slate-700"}`}>
                {label(provider.status)}
              </span>
            </div>
            {provider.implemented.length > 0 && <p className="mt-3 text-sm text-slate-600">
              Built for testing: {provider.implemented.map(label).join(", ")}.
            </p>}
            {provider.missing.length > 0 && <p className="mt-2 text-sm text-slate-600">
              Still needed: {provider.missing.map(label).join(", ")}.
            </p>}
          </article>;
        })}
      </div>
      <p className="mt-5 text-xs text-slate-500">
        No external OTA is currently connected. Do not accept live OTA reservations until partner approval, secure credentials, reservation processing, and provider certification are complete.
      </p>
    </>}
  </section>;
}
