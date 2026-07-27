import { DashboardShell } from "@/components/layout/dashboard-shell";
import { adminNavigation } from "@/data/navigation";
import { AdminProperties } from "@/components/dashboard/admin-properties";
export default function Page(){return <DashboardShell title="Admin Console" items={adminNavigation}><h1 className="text-3xl font-bold">Property review</h1><p className="mt-2 text-slate-600">Approve only verified 4- and 5-star hotels, resorts, and premium vacation homes.</p><AdminProperties /></DashboardShell>}
