import { DashboardShell } from "@/components/layout/dashboard-shell";
import { adminNavigation } from "@/data/navigation";
export default function Page(){return <DashboardShell title="Admin Console" items={adminNavigation}><h1 className="text-3xl font-bold">Partner management</h1><div className="card mt-8 p-8">Administrative module placeholder with role-based access required before launch.</div></DashboardShell>}
