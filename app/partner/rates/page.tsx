import { DashboardShell } from "@/components/layout/dashboard-shell";
import { RatesInventoryManager } from "@/components/dashboard/rates-inventory-manager";
import { partnerNavigation } from "@/data/navigation";
export default function Page(){return <DashboardShell title="Partner Center" items={partnerNavigation}><h1 className="text-3xl font-bold">Rates & inventory</h1><p className="mt-2 text-slate-600">Manage room types, nightly pricing, and available units by date.</p><RatesInventoryManager /></DashboardShell>}
