import { DashboardShell } from "@/components/layout/dashboard-shell";
import { AdminFinance } from "@/components/dashboard/admin-finance";
import { adminNavigation } from "@/data/navigation";
export default function Page(){return <DashboardShell title="Admin Console" items={adminNavigation}><h1 className="text-3xl font-bold">Finance and partner fees</h1><p className="mt-2 text-slate-600">Track recorded booking value, commission, iRate Rewards contributions, and partner liabilities. New hotel bookings use 13% commission + 3% rewards contribution; historical bookings retain their recorded terms.</p><AdminFinance /></DashboardShell>}
