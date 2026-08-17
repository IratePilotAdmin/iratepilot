import { AutomationOperationsCenter } from "@/components/dashboard/automation-operations-center";
import { DashboardShell } from "@/components/layout/dashboard-shell";
import { adminNavigation } from "@/data/navigation";

export default function Page() {
  return <DashboardShell title="Admin Console" items={adminNavigation}>
    <p className="text-xs font-semibold uppercase tracking-[.18em] text-brand-700">Automation Operations Center · Phase 1</p>
    <h1 className="mt-2 text-3xl font-bold">Automation operations</h1>
    <p className="mt-2 max-w-3xl text-slate-600">Monitor queues, failures, automation receipts, and private-pilot safety locks from one read-only command center.</p>
    <AutomationOperationsCenter />
  </DashboardShell>;
}
