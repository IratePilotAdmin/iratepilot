"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

type Snapshot = {
  property: { id: string; name: string };
  from: string;
  through: string;
  rooms: Array<{ id: string; name: string; base_rate: number | string }>;
  inventory: Array<{ room_id: string; stay_date: string; available_units: number; rate: number | string }>;
  source: "iratepilot_pms";
  readOnly: true;
  schemaVersion: 1;
  generatedAt: string;
};

const money = (value: number | string) => new Intl.NumberFormat("en-US", {
  style: "currency", currency: "USD",
}).format(Number(value));

async function loadSnapshot(propertyId: string, signal?: AbortSignal): Promise<Snapshot> {
  const response = await fetch(`/api/revenue/pms-snapshot?propertyId=${encodeURIComponent(propertyId)}`, { signal, cache: "no-store" });
  const body = await response.json();
  if (!response.ok) throw new Error(body.error || "PMS data could not be loaded.");
  return body as Snapshot;
}

export function PmsRevenueSnapshot({ propertyId }: { propertyId: string }) {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!propertyId) return;
    setLoading(true);
    setError("");
    try {
      setSnapshot(await loadSnapshot(propertyId));
    } catch (cause) {
      setSnapshot(null);
      setError(cause instanceof Error ? cause.message : "PMS data could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, [propertyId]);

  useEffect(() => {
    const controller = new AbortController();
    if (propertyId) {
      void loadSnapshot(propertyId, controller.signal).then(
        (result) => { if (!controller.signal.aborted) { setSnapshot(result); setLoading(false); } },
        (cause) => { if (!controller.signal.aborted) { setError(cause instanceof Error ? cause.message : "PMS data could not be loaded."); setLoading(false); } },
      );
    }
    return () => controller.abort();
  }, [propertyId]);

  const activeSnapshot = snapshot?.property.id === propertyId ? snapshot : null;
  const roomNames = useMemo(() => new Map(activeSnapshot?.rooms.map((room) => [room.id, room.name]) ?? []), [activeSnapshot]);
  const shown = activeSnapshot?.inventory.slice(0, 30) ?? [];

  const downloadSnapshot = () => {
    if (!activeSnapshot) return;
    const url = URL.createObjectURL(new Blob([JSON.stringify(activeSnapshot)], { type: "application/json" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `iratepilot-pms-${activeSnapshot.property.id}-${activeSnapshot.from}.json`;
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
  };

  return <section className="card p-6">
    <div className="flex flex-wrap items-center justify-between gap-4">
      <div>
        <h2 className="text-xl font-semibold">iRatePilot PMS inventory</h2>
        <p className="mt-1 text-sm text-slate-600">Read-only room rates and remaining availability for the next 90 days.</p>
      </div>
      <div className="flex flex-wrap gap-2">
        <button className="btn-secondary" type="button" disabled={!propertyId || loading} onClick={() => void refresh()}>
          {loading ? "Loading…" : "Refresh PMS data"}
        </button>
        <button className="btn-secondary" type="button" disabled={!activeSnapshot} onClick={downloadSnapshot}>
          Download read-only snapshot
        </button>
      </div>
    </div>
    {error && <p role="alert" className="mt-4 text-sm text-red-700">{error}</p>}
    {activeSnapshot && <>
      <p className="mt-4 text-sm text-slate-600">{activeSnapshot.property.name}: {activeSnapshot.rooms.length} active room types and {activeSnapshot.inventory.length} dated rates loaded. Snapshot generated {new Date(activeSnapshot.generatedAt).toLocaleString()}. Showing the first {shown.length} rows.</p>
      <div className="mt-4 overflow-x-auto"><table className="w-full text-left text-sm">
        <thead className="bg-slate-50 text-slate-600"><tr><th className="px-4 py-3">Stay date</th><th className="px-4 py-3">Room type</th><th className="px-4 py-3">Remaining units</th><th className="px-4 py-3">Current rate</th></tr></thead>
        <tbody>{shown.map((row) => <tr className="border-t" key={`${row.room_id}:${row.stay_date}`}><td className="px-4 py-3">{row.stay_date}</td><td className="px-4 py-3">{roomNames.get(row.room_id) || "Room type"}</td><td className="px-4 py-3">{row.available_units}</td><td className="px-4 py-3">{money(row.rate)}</td></tr>)}</tbody>
      </table></div>
      {!activeSnapshot.inventory.length && <p className="mt-4 text-sm text-slate-600">No dated inventory is loaded for this property.</p>}
      <p className="mt-4 text-sm text-slate-600">The downloaded JSON includes room types for the selected property, dated rates, and remaining availability. Keep it with authorized staff. Remaining availability is not total capacity or occupancy. Pricing recommendations still require verified booking pace and historical data; this view never updates a PMS rate.</p>
    </>}
  </section>;
}
