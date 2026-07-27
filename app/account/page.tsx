import { SiteHeader } from "@/components/layout/site-header";
import { SiteFooter } from "@/components/layout/site-footer";
import { AccountNotifications } from "@/components/bookings/account-notifications";
export default function Page(){return <><SiteHeader/><main className="container-page py-14"><h1 className="text-3xl font-bold">Account overview</h1><p className="mt-2 text-slate-500">Manage your profile, rewards, payments, and upcoming trips.</p><AccountNotifications /></main><SiteFooter/></>}
