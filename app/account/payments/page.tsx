import { SiteHeader } from "@/components/layout/site-header";
import { SiteFooter } from "@/components/layout/site-footer";
import { CustomerPaymentHistory } from "@/components/account/customer-payment-history";

export default function Page() {
  return <><SiteHeader/><main className="container-page py-14"><h1 className="text-3xl font-bold">Payment history</h1><p className="mt-2 text-slate-500">Review test payments, refunds, and booking requests that did not collect payment.</p><CustomerPaymentHistory /></main><SiteFooter/></>;
}
