"use client";

import { useState } from "react";

type Simulation = {
  propertyName: string;
  simulated: true;
  readOnly: true;
  inputRows: number;
  report: { averageOccupancy: number; averageRate: number; forecastRevenue: number };
  recommendations: Array<{ room_name: string; stay_date: string; currentRate: number; recommendedRate: number }>;
};

const money = (value: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(value);

export function PrivateRevenueSimulation() {
  const [simulation, setSimulation] = useState<Simulation | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function run() {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/revenue/private-simulation", { cache: "no-store" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Private simulation could not run.");
      setSimulation(body);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Private simulation could not run.");
    } finally {
      setLoading(false);
    }
  }

  return <div>
    <p className="text-sm text-slate-600">Run a synthetic 30-day Red Roof Inn Ridgeland test. Sample rates and occupancy are illustrative. No PMS records, bookings, guest data, or prices are changed.</p>
    <button className="btn-secondary mt-3" type="button" disabled={loading} onClick={() => void run()}>{loading ? "Running…" : "Run private synthetic test"}</button>
    {error && <p className="mt-3 text-sm text-red-700" role="alert">{error}</p>}
    {simulation && <div className="mt-4 rounded-xl border bg-slate-50 p-4 text-sm">
      <strong>{simulation.propertyName}</strong>
      <p className="mt-2">{simulation.inputRows} sample room dates · {simulation.report.averageOccupancy}% sample occupancy · {money(simulation.report.averageRate)} sample ADR · {money(simulation.report.forecastRevenue)} sample room revenue</p>
      <ul className="mt-3 list-disc pl-5">{simulation.recommendations.slice(0, 3).map(row => <li key={`${row.room_name}-${row.stay_date}`}>{row.stay_date} {row.room_name}: {money(row.currentRate)} → {money(row.recommendedRate)}</li>)}</ul>
      <p className="mt-3 text-slate-600">Read-only simulation. No live hotel data was used.</p>
    </div>}
  </div>;
}
