import { DashboardShell } from "@/components/layout/dashboard-shell";
import { AdminFinance } from "@/components/dashboard/admin-finance";
import { adminNavigation } from "@/data/navigation";
export default function Page(){return <DashboardShell title="Admin Console" items={adminNavigation}><h1 className="text-3xl font-bold">Finance and commissions</h1><p className="mt-2 text-slate-600">Track marketplace booking value, the 10% partner commission, and partner liabilities.</p><AdminFinance /></DashboardShell>}
