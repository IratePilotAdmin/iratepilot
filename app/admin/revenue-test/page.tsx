import { DashboardShell } from "@/components/layout/dashboard-shell";
import { PrivateRevenueSimulation } from "@/components/dashboard/private-revenue-simulation";
import { adminNavigation } from "@/data/navigation";

export default function Page() {
  return <DashboardShell title="Admin Console" items={adminNavigation}>
    <h1 className="text-3xl font-bold">Private Revenue AI test</h1>
    <p className="mt-2 text-slate-600">Use Red Roof Inn Ridgeland as a named test scenario without creating an active listing or connecting real PMS data.</p>
    <section className="card mt-6 p-6"><PrivateRevenueSimulation /></section>
  </DashboardShell>;
}
