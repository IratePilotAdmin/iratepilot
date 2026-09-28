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
const revenuePilotOrigin = "https://iratepilot-revenue-ai.iratepilot-7561.chatgpt.site";

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
  const [handoffStatus, setHandoffStatus] = useState("");

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

  const openRevenuePilot = () => {
    const selectedSnapshot = activeSnapshot;
    if (!selectedSnapshot) return;
    if (!selectedSnapshot.inventory.length) {
      setHandoffStatus("Load dated PMS inventory before opening Revenue AI.");
      return;
    }
    if (Date.now() - Date.parse(selectedSnapshot.generatedAt) > 24 * 60 * 60 * 1000) {
      setHandoffStatus("Refresh the PMS snapshot before opening Revenue AI.");
      return;
    }
    const popup = window.open(`${revenuePilotOrigin}/?handoff=pms`, "_blank");
    if (!popup) { setHandoffStatus("Allow the new tab, or download the snapshot and import it manually."); return; }
    setHandoffStatus("Opening the private Revenue AI workspace…");
    let sent = false;
    const timeout = window.setTimeout(() => {
      window.removeEventListener("message", onMessage);
      setHandoffStatus("The handoff did not finish. Download the snapshot and import it in Revenue AI.");
    }, 60_000);
    function onMessage(event: MessageEvent) {
      if (event.origin !== revenuePilotOrigin || event.source !== popup) return;
      if (event.data?.type === "iratepilot-revenue-ready" && !sent) {
        sent = true;
        popup?.postMessage({ type: "iratepilot-pms-snapshot", snapshot: selectedSnapshot }, revenuePilotOrigin);
      }
      if (event.data?.type === "iratepilot-revenue-received") {
        window.clearTimeout(timeout); window.removeEventListener("message", onMessage);
        setHandoffStatus("Read-only PMS snapshot opened in Revenue AI. Confirm the selected hotel there.");
      }
    }
    window.addEventListener("message", onMessage);
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
        <button className="btn-secondary" type="button" disabled={!activeSnapshot?.inventory.length} onClick={openRevenuePilot}>
          Open in Revenue AI pilot
        </button>
      </div>
    </div>
    {error && <p role="alert" className="mt-4 text-sm text-red-700">{error}</p>}
    {handoffStatus && <p role="status" className="mt-4 text-sm text-slate-700">{handoffStatus}</p>}
    {activeSnapshot && <>
      <p className="mt-4 text-sm text-slate-600">{activeSnapshot.property.name}: {activeSnapshot.rooms.length} active room types and {activeSnapshot.inventory.length} dated rates loaded. Snapshot generated {new Date(activeSnapshot.generatedAt).toLocaleString()}. Showing the first {shown.length} rows.</p>
      <div className="mt-4 overflow-x-auto"><table className="w-full text-left text-sm">
        <thead className="bg-slate-50 text-slate-600"><tr><th className="px-4 py-3">Stay date</th><th className="px-4 py-3">Room type</th><th className="px-4 py-3">Remaining units</th><th className="px-4 py-3">Current rate</th></tr></thead>
        <tbody>{shown.map((row) => <tr className="border-t" key={`${row.room_id}:${row.stay_date}`}><td className="px-4 py-3">{row.stay_date}</td><td className="px-4 py-3">{roomNames.get(row.room_id) || "Room type"}</td><td className="px-4 py-3">{row.available_units}</td><td className="px-4 py-3">{money(row.rate)}</td></tr>)}</tbody>
      </table></div>
      {!activeSnapshot.inventory.length && <p className="mt-4 text-sm text-slate-600">No dated inventory is loaded for this property. The Revenue AI handoff becomes available after PMS data is loaded.</p>}
      <p className="mt-4 text-sm text-slate-600">Open in Revenue AI transfers this selected property’s read-only snapshot directly to the private workspace tab after you click. It includes dated rates and remaining availability, without guest records or API tokens. You can also download the JSON and import it manually. Remaining availability is not total capacity or occupancy; this view never updates a PMS rate.</p>
    </>}
  </section>;
}
