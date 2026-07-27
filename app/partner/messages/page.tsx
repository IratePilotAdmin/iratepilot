import { DashboardShell } from "@/components/layout/dashboard-shell";
import { partnerNavigation } from "@/data/navigation";
export default function Page(){return <DashboardShell title="Partner Center" items={partnerNavigation}><h1 className="text-3xl font-bold">Guest messages</h1><div className="card mt-8 p-8">This module is ready for database and supplier integration.</div></DashboardShell>}
