import { DashboardShell } from "@/components/layout/dashboard-shell";
import { RevenueAiCenter } from "@/components/dashboard/revenue-ai-center";
import { partnerNavigation } from "@/data/navigation";
export default function Page(){return <DashboardShell title="Partner Center" items={partnerNavigation}><h1 className="text-3xl font-bold">Revenue AI</h1><p className="mt-2 text-slate-600">Upload hotel data, forecast the next 90 days, and approve explainable pricing recommendations.</p><RevenueAiCenter /></DashboardShell>}
