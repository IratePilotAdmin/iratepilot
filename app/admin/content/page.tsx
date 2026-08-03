import { DashboardShell } from "@/components/layout/dashboard-shell";
import { adminNavigation } from "@/data/navigation";
import { AdminContentQuality } from "@/components/dashboard/admin-content-quality";
export default function Page(){return <DashboardShell title="Admin Console" items={adminNavigation}><h1 className="text-3xl font-bold">Marketplace content quality</h1><p className="mt-2 text-slate-600">Audit listing presentation and booking readiness without bypassing the property review workflow.</p><AdminContentQuality /></DashboardShell>}
