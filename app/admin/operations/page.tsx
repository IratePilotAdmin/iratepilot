import { AutomationOperationsCenter } from "@/components/dashboard/automation-operations-center";
import { DashboardShell } from "@/components/layout/dashboard-shell";
import { adminNavigation } from "@/data/navigation";

export default function Page() {
  return <DashboardShell title="Admin Console" items={adminNavigation}>
    <p className="text-xs font-semibold uppercase tracking-[.18em] text-brand-700">Automation Operations Center · Phases 1–5</p>
    <h1 className="mt-2 text-3xl font-bold">Automation operations</h1>
    <p className="mt-2 max-w-3xl text-slate-600">Monitor queues, coordinate incidents, rehearse dual-approved controls, track SLO escalations, and validate one locked internal receipt adapter without contacting external systems.</p>
    <AutomationOperationsCenter />
  </DashboardShell>;
}
