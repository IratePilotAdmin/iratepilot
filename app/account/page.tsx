import { SiteHeader } from "@/components/layout/site-header";
import { SiteFooter } from "@/components/layout/site-footer";
import { CustomerAccountOverview } from "@/components/account/customer-account-overview";

export default function Page() {
  return <><SiteHeader/><main className="container-page py-14"><h1 className="text-3xl font-bold">Account overview</h1><CustomerAccountOverview /></main><SiteFooter/></>;
}
