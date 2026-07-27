import { SiteHeader } from "@/components/layout/site-header";
import { SiteFooter } from "@/components/layout/site-footer";
import { MembershipCenter } from "@/components/account/membership-center";
export default function Page(){return <><SiteHeader/><main className="container-page py-14"><h1 className="text-3xl font-bold">Membership & rewards</h1><p className="mt-2 text-slate-500">Track points, member status, and test membership subscriptions.</p><MembershipCenter /></main><SiteFooter/></>}
